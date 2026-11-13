import type { Content } from '../../content/build'
import { formatModifier } from '../../engine/format'
import { tierFaces, type Tier } from '../../engine/rules/checks'
import { availableActions, type Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { TierOutcomes } from './TierOutcomes'
import { daysText } from './travelText'

/**
 * Exploring the domain the party is in: who searches, with what, against what DC, the days it
 * takes and what each non-critical tier finds, with its chance (a vertical list, always
 * shown: design §9), before the party commits. Nothing when the engine offers no search here.
 */
export function ExploreAction({
  content,
  state,
  onAction,
  compact = false,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
  /** The town ledger's version: the button and who searches on one line, then the outcomes. */
  compact?: boolean
}) {
  const { t, stat } = useI18n()
  const action = availableActions(state, content).find((a) => a.type === 'explore')
  if (!action) return null
  const { option } = action
  // Once the party knows the domain is bare, the text replaces the search (no button, no odds).
  if (option.explored) {
    return (
      <p className="muted small explore-line" role="group" aria-label={t('explore.heading')}>
        {t('explore.fullyExplored')}
      </p>
    )
  }
  const name = state.party.find((c) => c.id === option.actorId)?.name ?? '?'
  const faces = tierFaces(option.modifier, option.dc)
  const finds = (tier: Tier) => {
    const { found, days } = option.finds[tier]
    if (found === 0) return t('explore.nothing')
    return days > option.days
      ? t('explore.foundLate', { extra: days - option.days })
      : t('explore.found')
  }
  // Who searches, with what, against what DC; the days are on the button, the chances below.
  const line = t('explore.line', {
    name,
    skill: stat(option.skill),
    modifier: formatModifier(option.modifier),
    dc: option.dc,
  })
  // The modifier already includes the surveyor's maps; the tooltip says how much.
  const lineTitle =
    option.maps > 0 ? t('explore.mapsHint', { bonus: formatModifier(option.maps) }) : undefined
  const button = (
    <button
      disabled={option.hungry}
      title={option.hungry ? t('explore.hungry') : t('explore.foodHint')}
      onClick={() => onAction({ type: 'explore' })}
    >
      {t('explore.button', { days: daysText(t, option.days), food: option.food })}
    </button>
  )
  const outcomes = (
    <TierOutcomes label={t('explore.outcomes')} odds={option.chances} faces={faces} text={finds} />
  )
  if (compact) {
    return (
      <div className="explore-line" role="group" aria-label={t('explore.heading')}>
        {button}{' '}
        <span className="small" title={lineTitle}>
          {line}
        </span>
        {outcomes}
      </div>
    )
  }
  return (
    <div className="check-preview explore" role="group" aria-label={t('explore.heading')}>
      <h3>{t('explore.heading')}</h3>
      <p className="small" title={lineTitle}>
        {line}
      </p>
      {outcomes}
      {button}
    </div>
  )
}
