import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { levelNumeral, upgradeOffers } from '../../engine/town/upgrades'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'

/**
 * The party upgrades a service sells here (Plan 6c), on its tile: a button per upgrade for its
 * next level ("Surveyor's maps II · 200 gp") with what that level does under it; the tooltip has
 * the flavour and how it grows. One the purse can't cover is only disabled (no reason line).
 */
export function UpgradeOffers({
  content,
  state,
  service,
  onAction,
}: {
  content: Content
  state: GameState
  service: string
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const offers = upgradeOffers(state, content).filter((o) => o.service === service)
  if (offers.length === 0) return null
  return (
    <div className="upgrade-offers">
      {offers.map((o) => (
        <div key={o.id} className="upgrade-offer">
          <button
            disabled={!o.affordable}
            title={o.detail}
            onClick={() => onAction({ type: 'buyUpgrade', upgrade: o.id })}
          >
            {t('upgrades.offer', { name: o.name, level: levelNumeral(o.level), gp: o.price })}
          </button>
          <span className="muted small upgrade-effect">{o.effect}</span>
        </div>
      ))}
    </div>
  )
}
