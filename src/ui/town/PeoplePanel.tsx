import type { Content } from '../../content/build'
import { capitalFirst, formatModifier, formatPoints } from '../../engine/format'
import { tierFaces, type Tier } from '../../engine/rules/checks'
import type { Action } from '../../engine/state'
import { peopleRows, standingView } from '../../engine/town/reputation'
import { RUMOURS_DONE, rumourOption, rumourRefusal } from '../../engine/town/rumours'
import type { GameState } from '../../schema/state'
import { useI18n, type I18n } from '../i18n/I18n'
import { TierOutcomes } from '../world/TierOutcomes'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/**
 * The notable people here (design §8): each with their title and name and their role. They are
 * flavour and roles (patrons, keepers): reputation is with the settlement (designer call
 * 2026-11-14). Always open (designer decision): the list is compact.
 */
export function PeoplePanel({ content, state }: Omit<Props, 'onAction'>) {
  const { t, name } = useI18n()
  const people = peopleRows(state, content)
  return (
    <section className="zone zone-people" aria-label={t('people.list')}>
      <h3>{t('ledger.people', { n: people.length })}</h3>
      {people.length === 0 ? (
        <p className="muted small">{t('ledger.noPeople')}</p>
      ) : (
        <ul className="people small" aria-label={t('people.list')}>
          {people.map((p) => (
            <li key={p.id}>
              <span className="person-name">{p.name}</span>{' '}
              <span className="muted">
                · {name('personRoles', state.world.people[p.id]?.role ?? '', p.role)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Reputation points as plain text after a label ("Reputation 3", "Reputation −4"; designer,
 * 2026-11-14: the points, not the tier), negative ones in the bad tone. The tooltip names the
 * tier, its range and what it does, then any `note` on a line of its own (the kingdom's average).
 */
export function ReputationValue({
  points,
  label,
  note,
}: {
  points: number
  label: string
  note?: string | null
}) {
  const i18n = useI18n()
  const hint = reputationHint(i18n.t, points)
  const tone = points < 0 ? 'tone-bad' : points > 0 ? 'tone-good' : 'muted'
  return (
    <span className={`rep ${tone}`} title={note ? `${hint}\n${note}` : hint}>
      {label} {formatPoints(points)}
    </span>
  )
}

/** "Known (5 to 14): market spreads 2 points narrower, rumour DC 1 lower". */
export function reputationHint(t: I18n['t'], points: number): string {
  const v = standingView(points)
  const range =
    v.min === null
      ? t('reputation.below', { max: formatPoints(v.max!) })
      : v.max === null
        ? t('reputation.above', { min: formatPoints(v.min) })
        : t('reputation.range', { min: formatPoints(v.min), max: formatPoints(v.max) })
  const effects =
    v.spread > 0 || v.rumourDc > 0
      ? t('reputation.better', { spread: v.spread, dc: v.rumourDc })
      : v.spread < 0 || v.rumourDc < 0
        ? t('reputation.worse', { spread: -v.spread, dc: -v.rumourDc })
        : t('reputation.none')
  return t('reputation.hint', { tier: capitalFirst(t(`standing.${v.standing}`)), range, effects })
}

/**
 * Listening for rumours at the tavern, in the style of Explore: who listens, with what and against
 * what DC, then the non-critical tiers with their chances as a list (always shown,
 * so they read without the button, which is disabled when the party can't pay). Nothing where
 * there is no tavern; a muted note once the talk here is heard.
 */
export function RumoursLine({ content, state, onAction }: Props) {
  const { t, stat } = useI18n()
  const option = rumourOption(state, content)
  if (!option) {
    const refusal = rumourRefusal(state, content)
    if (refusal === null || !state.doneHere.includes(RUMOURS_DONE)) return null
    return <p className="muted small rumours-line">{t('rumours.heard')}</p>
  }
  const name = state.party.find((c) => c.id === option.actorId)?.name ?? '?'
  const faces = tierFaces(option.modifier, option.dc)
  const short = state.gold < option.cost
  const check = {
    name,
    skill: stat(option.skill),
    modifier: formatModifier(option.modifier),
    dc: option.dc,
  }
  return (
    <div className="explore-line rumours-line" role="group" aria-label={t('rumours.heading')}>
      <button disabled={short} onClick={() => onAction({ type: 'listenRumours' })}>
        {t('rumours.button', { gp: option.cost })}
      </button>{' '}
      <span className="small">{t('rumours.line', check)}</span>
      {short && <p className="tone-bad small">{t('rumours.short')}</p>}
      <TierOutcomes
        label={t('rumours.outcomes')}
        odds={option.chances}
        faces={faces}
        text={(tier: Tier) => t(`rumours.tier.${tier as 'fail' | 'partial' | 'success'}`)}
      />
    </div>
  )
}
