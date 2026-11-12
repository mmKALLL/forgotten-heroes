import { POI_CATEGORIES, type PoiCategory } from '../../schema/types'
import type { MapPoint } from '../../schema/world'
import type { MessageKey } from '../i18n/en'
import type { I18n } from '../i18n/I18n'

/** A five-pointed star in the unit box, for wonders. */
const STAR =
  Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? 0.9 : 0.38
    return `${i === 0 ? 'M' : 'L'}${(r * Math.cos(angle)).toFixed(3)},${(r * Math.sin(angle)).toFixed(3)}`
  }).join(' ') + ' Z'

/**
 * Inline glyphs per category, drawn in a box from −1 to 1, so the map needs no icon assets. A
 * category without one (added later) gets a plain dot.
 */
export const POI_GLYPHS: Readonly<Record<PoiCategory, string>> = {
  // A doorway arch.
  dungeon: 'M-0.6,0.75 V-0.1 A0.6,0.6 0 0 1 0.6,-0.1 V0.75 Z',
  // A head and shoulders.
  expert:
    'M0,-0.85 A0.32,0.32 0 1 1 0,-0.21 A0.32,0.32 0 1 1 0,-0.85 Z M-0.65,0.8 C-0.65,0 0.65,0 0.65,0.8 Z',
  // Two fangs.
  lair: 'M-0.8,-0.6 H0.8 L0.4,0.75 L0,-0.05 L-0.4,0.75 Z',
  // A roof over a little hall.
  shrine: 'M0,-0.85 L0.8,-0.2 H-0.8 Z M-0.5,-0.1 H0.5 V0.75 H-0.5 Z',
  // An obelisk.
  landmark: 'M-0.15,-0.85 H0.15 L0.38,0.75 H-0.38 Z',
  wonder: STAR,
  // An exclamation mark.
  quest: 'M-0.2,-0.85 H0.2 L0.1,0.25 H-0.1 Z M-0.2,0.45 H0.2 V0.85 H-0.2 Z',
}

const isCategory = (c: string | null): c is PoiCategory =>
  c !== null && (POI_CATEGORIES as readonly string[]).includes(c)

/** A category's name in the UI language ("site" when unknown). */
export const poiCategoryText = (t: I18n['t'], category: string | null): string =>
  isCategory(category) ? t(`poiCategory.${category}` as MessageKey) : t('poiCategory.unknown')

/** A category's glyph, centred on `at`, `size` map pixels from the centre to an edge. */
export function PoiGlyph({
  category,
  at,
  size,
}: {
  category: string | null
  at: MapPoint
  size: number
}) {
  const transform = `translate(${at.x} ${at.y}) scale(${size})`
  return isCategory(category) ? (
    <path
      className={`poi-glyph glyph-${category}`}
      d={POI_GLYPHS[category]}
      transform={transform}
    />
  ) : (
    <circle className="poi-glyph glyph-unknown" r={0.4} transform={transform} />
  )
}
