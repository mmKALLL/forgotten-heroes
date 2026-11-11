import { formatFaces, formatFacesShort, formatPercent } from '../engine/format'
import { TIERS, TIER_LABELS, type FaceRange, type Tier } from '../engine/rules/checks'

export type OddsLabelMode = 'percent' | 'faces'

/** Segments narrower than this keep their label in the tooltip only. */
const MIN_LABEL_WIDTH = 0.08

export function OddsBar({
  odds,
  faces,
  labelMode,
}: {
  odds: Record<Tier, number>
  faces?: Record<Tier, FaceRange | null>
  labelMode: OddsLabelMode
}) {
  const describe = (t: Tier) => {
    const range = faces?.[t]
    const pct = formatPercent(odds[t])
    return range ? `${TIER_LABELS[t]}: ${formatFaces(range)} (${pct})` : `${TIER_LABELS[t]}: ${pct}`
  }
  const label = (t: Tier) => {
    const range = faces?.[t]
    if (labelMode === 'faces' && range) {
      // The lone 1 and 20 are short enough to fit even a thin segment.
      const short = range.min === range.max && (range.min === 1 || range.min === 20)
      return short || odds[t] >= MIN_LABEL_WIDTH ? formatFacesShort(range) : ''
    }
    return odds[t] >= MIN_LABEL_WIDTH ? formatPercent(odds[t]) : ''
  }
  return (
    <div
      className={`odds-bar label-${labelMode}`}
      role="img"
      aria-label={TIERS.map(describe).join(', ')}
    >
      {TIERS.filter((t) => odds[t] > 0).map((t) => (
        <span key={t} className={`odds-seg tier-${t}`} style={{ flexGrow: odds[t] }} title={describe(t)}>
          {label(t)}
        </span>
      ))}
    </div>
  )
}
