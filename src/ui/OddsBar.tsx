import { formatFaces, formatFacesShort, formatPercent } from '../engine/format'
import { TIERS, type FaceRange, type RollMode, type Tier } from '../engine/rules/checks'
import type { MessageKey } from './i18n/en'
import { useI18n } from './i18n/I18n'

export type OddsLabelMode = 'percent' | 'faces'

/** Appended to "needs 12+ on the d20" under Edge or Exposed (message keys; none when normal). */
export const ROLL_MODE_SUFFIX: Record<RollMode, MessageKey | null> = {
  normal: null,
  advantage: 'roll.best',
  disadvantage: 'roll.worst',
}

/** Lowest kept face that succeeds; only the natural 20 when the DC is out of reach. */
export const neededFace = (faces: Record<Tier, FaceRange | null>): number =>
  faces.success?.min ?? 20

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
  const { tier: tierName } = useI18n()
  const describe = (t: Tier) => {
    const range = faces?.[t]
    const pct = formatPercent(odds[t])
    return range ? `${tierName(t)}: ${formatFaces(range)} (${pct})` : `${tierName(t)}: ${pct}`
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
        <span
          key={t}
          className={`odds-seg tier-${t}`}
          style={{ flexGrow: odds[t] }}
          title={describe(t)}
        >
          {label(t)}
        </span>
      ))}
    </div>
  )
}
