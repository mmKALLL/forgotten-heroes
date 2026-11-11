import { formatPercent } from '../engine/format'
import { TIERS, TIER_LABELS, type Tier } from '../engine/rules/checks'

export function OddsBar({ odds }: { odds: Record<Tier, number> }) {
  return (
    <div className="odds-bar" role="img" aria-label={TIERS.map((t) => `${TIER_LABELS[t]} ${formatPercent(odds[t])}`).join(', ')}>
      {TIERS.filter((t) => odds[t] > 0).map((t) => (
        <span key={t} className={`odds-seg tier-${t}`} style={{ flexGrow: odds[t] }} title={`${TIER_LABELS[t]}: ${formatPercent(odds[t])}`}>
          {odds[t] >= 0.08 ? formatPercent(odds[t]) : ''}
        </span>
      ))}
    </div>
  )
}
