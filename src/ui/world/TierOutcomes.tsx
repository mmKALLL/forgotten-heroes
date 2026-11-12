import { formatFaces, formatPercent } from '../../engine/format'
import type { FaceRange, Tier } from '../../engine/rules/checks'
import { useI18n } from '../i18n/I18n'

/** The tiers a check preview lists, best first. Critical tiers stay unlisted (design §7). */
const SHOWN: readonly Tier[] = ['success', 'partial', 'fail']

/**
 * What a travel check's fail, partial and success lead to, each with its d20 faces, as the
 * encounter Outcomes panel shows them. Tiers the roll can't land on are left out.
 */
export function TierOutcomes({
  label,
  odds,
  faces,
  text,
}: {
  label: string
  odds: Record<Tier, number>
  faces: Record<Tier, FaceRange | null>
  text: (tier: Tier) => string
}) {
  const { tier: tierName } = useI18n()
  const rows = SHOWN.filter((t) => odds[t] > 0)
  return (
    <ul className="outcomes check-outcomes small" aria-label={label}>
      {rows.map((tier) => {
        const range = faces[tier]
        return (
          <li key={tier}>
            <span
              className={`tier-marker tier-${tier}`}
              title={`${tierName(tier)} (${formatPercent(odds[tier])})`}
            >
              <span className="sr-only">{tierName(tier)}: </span>
            </span>
            <div>
              {range && <span className="faces muted">{formatFaces(range)}</span>}
              {text(tier)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
