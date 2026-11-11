import { overlay, valueAtPath } from '../../content/localize'
import { fillText } from '../../engine/encounters/slots'
import type { EncounterLogEntry, GameState } from '../../schema/state'

/**
 * The game state as the encounter view shows it in another language: the situation snapshot with
 * its translated text overlaid, so the engine's previews come out translated, and the encounter
 * log's stage and outcome lines swapped for their translations.
 *
 * Rough by design: log lines are matched against the English text they were filled from, and
 * engine-made text (roll lines, effect chips like "−2 gp") and slot values stay English. Structured
 * log messages will replace the matching later. Display only: never dispatch with the result.
 */
export function localizeEncounterState(
  state: GameState,
  fields: Readonly<Record<string, string>> | null
): GameState {
  const encounter = state.encounter
  if (!encounter || !fields) return state
  const { slots } = encounter
  const original = encounter.situation
  const overlaid = overlay(original, fields)
  // The title and the twist were filled once, when the encounter started; fill their translations.
  const situation = {
    ...overlaid,
    title: fillText(overlaid.title, slots),
    ...(overlaid.twist && {
      twist: { ...overlaid.twist, what: fillText(overlaid.twist.what, slots) },
    }),
  }

  const pairs = Object.entries(fields).flatMap(([path, text]) => {
    const english = valueAtPath(original, path)
    return typeof english === 'string' && english !== text ? [{ english, text }] : []
  })
  const translateLine = (entry: EncounterLogEntry): EncounterLogEntry => {
    const actor = entry.roll && state.party.find((c) => c.id === entry.roll!.actorId)?.name
    const values = actor ? { ...slots, actor } : slots
    let best: { length: number; text: string } | null = null
    for (const pair of pairs) {
      const english = fillText(pair.english, values)
      // An outcome line may end with its effect chips: "You cross. (−12 gp)".
      const matches = entry.text === english || entry.text.startsWith(`${english} (`)
      if (matches && (!best || english.length > best.length)) {
        best = {
          length: english.length,
          text: fillText(pair.text, values) + entry.text.slice(english.length),
        }
      }
    }
    return best ? { ...entry, text: best.text } : entry
  }
  return {
    ...state,
    encounter: { ...encounter, situation, log: encounter.log.map(translateLine) },
  }
}
