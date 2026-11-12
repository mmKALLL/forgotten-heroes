import { formatFaces, formatPercent } from '../../engine/format'
import type { FaceRange, Tier } from '../../engine/rules/checks'
import { useI18n } from '../i18n/I18n'

/** The tiers a check preview lists, best first. Critical tiers stay unlisted (design §7). */
const SHOWN: readonly Tier[] = ['success', 'partial', 'fail']

/**
 * What a town or travel check's success, partial and fail lead to (design §9): a vertical list,
 * one line per tier with its d20 faces and chance, always shown inline (no odds bar, no hover).
 * Tiers the roll can't land on are left out. `inline` runs the tiers on one line ("▮ 60% 6 fuel ·
 * ▮ 15% 3 fuel"), the faces on hover, for a row that must stay short (gathering in the ledger).
 */
export function TierOutcomes({
  label,
  odds,
  faces,
  text,
  inline = false,
}: {
  label: string
  odds: Record<Tier, number>
  faces: Record<Tier, FaceRange | null>
  text: (tier: Tier) => string
  inline?: boolean
}) {
  const { tier: tierName } = useI18n()
  const rows = SHOWN.filter((t) => odds[t] > 0)
  if (inline) {
    return (
      <ul className="check-outcomes inline-outcomes small" aria-label={label}>
        {rows.map((tier) => {
          const range = faces[tier]
          return (
            <li key={tier} title={range ? `${tierName(tier)}: ${formatFaces(range)}` : undefined}>
              <span className={`tier-marker tier-${tier}`} title={tierName(tier)}>
                <span className="sr-only">{tierName(tier)}: </span>
              </span>
              <span className="chance muted">{formatPercent(odds[tier])}</span>{' '}
              <span className="tier-text">{text(tier)}</span>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <ul className="outcomes check-outcomes small" aria-label={label}>
      {rows.map((tier) => {
        const range = faces[tier]
        return (
          <li key={tier}>
            <span className={`tier-marker tier-${tier}`} title={tierName(tier)}>
              <span className="sr-only">{tierName(tier)}: </span>
            </span>
            <span className="faces muted">{range ? formatFaces(range) : ''}</span>
            <span className="chance muted">{formatPercent(odds[tier])}</span>
            <span className="tier-text">{text(tier)}</span>
          </li>
        )
      })}
    </ul>
  )
}
