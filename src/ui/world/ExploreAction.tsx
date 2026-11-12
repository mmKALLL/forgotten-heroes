import type { Content } from '../../content/build'
import { formatModifier, formatPercent } from '../../engine/format'
import { tierFaces, type Tier } from '../../engine/rules/checks'
import { availableActions, type Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { OddsBar } from '../OddsBar'
import { TierOutcomes } from './TierOutcomes'
import { daysText } from './travelText'

/**
 * Exploring the domain the party is in: who searches, with what, against what DC, the chance to
 * find a site, the days it takes and what each non-critical tier finds, before the party commits.
 * Nothing when the engine offers no search here.
 */
export function ExploreAction({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
}) {
  const { t, stat } = useI18n()
  const action = availableActions(state, content).find((a) => a.type === 'explore')
  if (!action) return null
  const { option } = action
  const name = state.party.find((c) => c.id === option.actorId)?.name ?? '?'
  const faces = tierFaces(option.modifier, option.dc)
  const chance = option.chances.partial + option.chances.success + option.chances.critSuccess
  const finds = (tier: Tier) => {
    const { found, days } = option.finds[tier]
    if (found === 0) return t('explore.nothing')
    return days > option.days
      ? t('explore.foundLate', { days: daysText(t, days) })
      : t('explore.found')
  }
  return (
    <div className="check-preview explore" role="group" aria-label={t('explore.heading')}>
      <h3>{t('explore.heading')}</h3>
      <p className="small">
        {t('explore.check', {
          name,
          skill: stat(option.skill),
          modifier: formatModifier(option.modifier),
          dc: option.dc,
          days: daysText(t, option.days),
        })}
      </p>
      <p className="small">{t('explore.chance', { pct: formatPercent(chance) })}</p>
      <OddsBar odds={option.chances} faces={faces} labelMode="faces" />
      <TierOutcomes
        label={t('explore.outcomes')}
        odds={option.chances}
        faces={faces}
        text={finds}
      />
      <button onClick={() => onAction({ type: 'explore' })}>
        {t('explore.button', { days: daysText(t, option.days) })}
      </button>
    </div>
  )
}
