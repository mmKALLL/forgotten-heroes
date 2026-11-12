import { useRef, useState, type KeyboardEvent } from 'react'
import { sortedEntries, type Content } from '../../content/build'
import { routeOptions } from '../../engine/travel/preview'
import { settlementName } from '../../engine/world/geo'
import { edgesFrom, nodeOf } from '../../engine/world/graph'
import { SPOT_SPACING_PX, territory } from '../../engine/world/territory'
import type { GameState } from '../../schema/state'
import { MAP_HEIGHT, MAP_WIDTH, type Kingdom, type MapPoint } from '../../schema/world'
import { iconUrl } from '../assets'
import { useI18n } from '../i18n/I18n'
import { PoiGlyph, poiCategoryText } from './PoiGlyph'
import { dangerText } from './travelText'

/**
 * Marker outlines and overlay fills by kingdom, in kingdom order (a world rolls up to 12). They
 * read on the parchment map in both themes.
 */
export const KINGDOM_COLOURS = [
  '#9c2f24',
  '#2f5c8a',
  '#3f6b35',
  '#7b3f1d',
  '#6a3f8a',
  '#b58500',
  '#2f7a7a',
  '#8a2f5c',
  '#d4632a',
  '#0b8fc4',
  '#6f8a00',
  '#4b4b4b',
] as const

/** Each kingdom's colour by id, in kingdom order (wrapping past the twelfth). */
export const kingdomColours = (kingdoms: readonly Pick<Kingdom, 'id'>[]): Map<string, string> =>
  new Map(kingdoms.map((k, i) => [k.id, KINGDOM_COLOURS[i % KINGDOM_COLOURS.length]]))

/** Whether this viewer last left the kingdom overlay on (off by default). */
export const KINGDOM_OVERLAY_KEY = 'forgotten-heroes/ui/map-kingdoms'

function loadOverlay(): boolean {
  try {
    return localStorage.getItem(KINGDOM_OVERLAY_KEY) === 'true'
  } catch {
    return false
  }
}

function saveOverlay(on: boolean) {
  try {
    localStorage.setItem(KINGDOM_OVERLAY_KEY, String(on))
  } catch {
    // Storage unavailable (private mode, quota): the choice just won't persist.
  }
}

/**
 * Road colours by danger (0 Safe to 3 Deadly): pale to dark red, so the scale reads by lightness
 * as well as hue. Fixed rather than themed, since they sit on the same map image in both themes;
 * a dark casing under each road keeps the pale ones visible.
 */
export const DANGER_COLOURS = ['#f4ead2', '#f0b429', '#e0662b', '#b51f18'] as const
/**
 * The zoomed view (the default): this many map pixels around the party, enough to show the
 * neighbours most roads lead to (nine in ten land roads are under 420 px long).
 */
export const ZOOM = { width: 1200, height: 900 }
/**
 * Half a marker's width, in map pixels (the map's own markers are about 20 px): larger on the
 * whole map, which is drawn at about a fifth of its size, so markers stay easy to see and hit.
 */
const MARKER = { full: 38, zoomed: 26 }
const ARROWS: Record<string, MapPoint> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

type Props = {
  content: Content
  state: GameState
  /** The settlement or point of interest whose details (and road) are shown. */
  selected: string | null
  onSelect: (placeId: string) => void
  /** The Altaeus map image (a local asset), or null to draw on plain parchment. */
  imageUrl: string | null
}

const lerp = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** A small three-pointed crown above a seat's marker. */
function crownPath(at: MapPoint, marker: number): string {
  const w = marker * 0.9
  const h = marker * 0.6
  const base = at.y - marker - 8
  const left = at.x - w
  const right = at.x + w
  return (
    `M${left},${base} L${left},${base - h} L${at.x - w / 2},${base - h / 2} ` +
    `L${at.x},${base - h * 1.3} L${at.x + w / 2},${base - h / 2} L${right},${base - h} ` +
    `L${right},${base} Z`
  )
}

/** The whole map, or a window around `centre` that stays inside the map. */
export function viewBoxFor(centre: MapPoint | null, zoomed: boolean): string {
  if (!zoomed || !centre) return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`
  const x = Math.min(Math.max(0, centre.x - ZOOM.width / 2), MAP_WIDTH - ZOOM.width)
  const y = Math.min(Math.max(0, centre.y - ZOOM.height / 2), MAP_HEIGHT - ZOOM.height)
  return `${Math.round(x)} ${Math.round(y)} ${ZOOM.width} ${ZOOM.height}`
}

/**
 * The marker nearest `from` in the direction `dir` (a unit vector), favouring those straight
 * ahead: distance along the direction plus twice the distance across it. Null if none lies that way.
 */
export function nearestInDirection(
  from: MapPoint,
  dir: MapPoint,
  sites: readonly { id: string; at: MapPoint }[]
): string | null {
  let best: { id: string; score: number } | null = null
  for (const s of sites) {
    const dx = s.at.x - from.x
    const dy = s.at.y - from.y
    const along = dx * dir.x + dy * dir.y
    if (along <= 0) continue
    const score = along + 2 * Math.abs(dx * dir.y - dy * dir.x)
    if (!best || score < best.score) best = { id: s.id, score }
  }
  return best?.id ?? null
}

/**
 * Altaeus: routes (coloured by danger, with a legend; sea crossings dashed), settlements outlined
 * in their kingdom's colour, discovered points of interest as category glyphs (dimmed once
 * cleared), and the party (a ring with a pulsing halo), in a place or partway along a road. The
 * view starts zoomed in on the party and follows it; "Whole map" zooms out. Settlements and sites are buttons
 * that select. Only the party's place, the roads' ends and the selection are tab stops; the arrow
 * keys move between all of them. The kingdom overlay (remembered per viewer) tints every land
 * spot in its domain's kingdom colour and crowns the seats.
 */
export function WorldMap({ content, state, selected, onSelect, imageUrl }: Props) {
  const { t } = useI18n()
  // Zoomed in on the party by default; the view follows it as it moves.
  const [zoomed, setZoomed] = useState(true)
  const [overlay, setOverlay] = useState(loadOverlay)
  const svg = useRef<SVGSVGElement>(null)
  const marker = zoomed ? MARKER.zoomed : MARKER.full
  const at = (id: string): MapPoint | null => nodeOf(state, content, id)?.at ?? null
  const travel = state.travel
  const from = travel ? at(travel.from) : null
  const to = travel ? at(travel.to) : null
  const party = travel
    ? from && to
      ? lerp(from, to, Math.min(1, travel.kmDone / travel.km))
      : null
    : state.location
      ? at(state.location)
      : null
  const roads = routeOptions(state, content)
  const reachable = new Set(roads.map((r) => r.to))
  const shownRoute = travel?.route ?? roads.find((r) => r.to === selected)?.routeId ?? null
  const colours = kingdomColours(state.world.kingdoms)
  const colourOf = (domain: string | undefined) =>
    domain !== undefined && Object.hasOwn(state.world.domains, domain)
      ? colours.get(state.world.domains[domain].kingdom)
      : undefined
  const seats = new Set(state.world.kingdoms.map((k) => k.seat))
  const sites = sortedEntries(content.settlements)
  const pois = Object.entries(state.world.pois).flatMap(([id, poi]) => {
    const node = poi.discovered ? nodeOf(state, content, id) : null
    if (!node) return []
    const type = Object.hasOwn(content.poiTypes, poi.type) ? content.poiTypes[poi.type] : undefined
    return [{ id, at: node.at, poi, category: type?.category ?? null, icon: iconUrl(type?.icon) }]
  })
  // Everything the arrow keys move between.
  const markers: { id: string; at: MapPoint }[] = [...sites, ...pois]
  // Roving tab stops: where the party is (or is headed), where it can go, and the selection.
  const tabStops = new Set(reachable)
  if (state.location) tabStops.add(state.location)
  if (travel) tabStops.add(travel.to)
  if (selected) tabStops.add(selected)
  if (tabStops.size === 0 && sites.length > 0) tabStops.add(sites[0].id)
  const domainOf = overlay ? territory(content).domainOf : {}
  const onKey = (id: string, at: MapPoint) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
      return
    }
    if (!Object.hasOwn(ARROWS, e.key)) return
    e.preventDefault()
    const next = nearestInDirection(at, ARROWS[e.key], markers)
    if (!next) return
    svg.current?.querySelector<SVGGElement>(`[data-site="${next}"]`)?.focus()
  }
  const toggleOverlay = () => {
    setOverlay(!overlay)
    saveOverlay(!overlay)
  }

  return (
    <section className="panel map-panel" aria-label={t('map.heading')}>
      <div className="map-head">
        <h2>{t('map.heading')}</h2>
        <div className="map-buttons">
          <button type="button" aria-pressed={overlay} onClick={toggleOverlay}>
            {t('map.kingdoms')}
          </button>
          <button type="button" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>
            {zoomed ? t('map.zoomOut') : t('map.zoomIn')}
          </button>
        </div>
      </div>
      <svg
        ref={svg}
        className={`world-map ${zoomed ? 'zoomed' : 'full'}`}
        viewBox={viewBoxFor(party, zoomed)}
        role="group"
        aria-label={t('map.label')}
      >
        {imageUrl ? (
          <image href={imageUrl} x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} />
        ) : (
          <rect className="map-parchment" x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} />
        )}
        {overlay && (
          <g className="kingdom-overlay" aria-hidden="true">
            {sortedEntries(content.landSpots).map((spot) => {
              const fill = colourOf(domainOf[spot.id])
              if (!fill) return null
              return (
                <rect
                  key={spot.id}
                  className="kingdom-spot"
                  data-spot={spot.id}
                  x={spot.at.x - SPOT_SPACING_PX / 2}
                  y={spot.at.y - SPOT_SPACING_PX / 2}
                  width={SPOT_SPACING_PX}
                  height={SPOT_SPACING_PX}
                  style={{ fill }}
                />
              )
            })}
          </g>
        )}
        {/* The map image prints the region names itself. */}
        {!imageUrl &&
          sortedEntries(content.regions).map((r) => (
            <text
              key={r.id}
              className="region-label"
              x={r.label.x}
              y={r.label.y}
              textAnchor="middle"
            >
              {r.name}
            </text>
          ))}
        {sortedEntries(content.routes).map((r) => {
          const a = at(r.from)
          const b = at(r.to)
          if (!a || !b) return null
          const danger = Math.max(0, Math.min(3, r.danger))
          const extra = [r.terrain === 'sea' && 'sea', r.id === shownRoute && 'active']
            .filter(Boolean)
            .join(' ')
          const ends = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
          return (
            <g key={r.id}>
              <line className={`route-casing ${extra}`} {...ends} />
              <line
                className={`route danger-${danger} ${extra}`}
                style={{ stroke: DANGER_COLOURS[danger] }}
                {...ends}
              />
            </g>
          )
        })}
        {/* The paths to discovered sites, thinner than roads, coloured the same way. */}
        {pois.flatMap(({ id }) =>
          edgesFrom(state, content, id).map((r) => {
            const a = at(r.from)
            const b = at(r.to)
            if (!a || !b) return null
            const danger = Math.max(0, Math.min(3, r.danger))
            const active = r.id === shownRoute ? 'active' : ''
            const ends = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
            return (
              <g key={r.id} data-route={r.id}>
                <line className={`route-casing path ${active}`} {...ends} />
                <line
                  className={`route path danger-${danger} ${active}`}
                  style={{ stroke: DANGER_COLOURS[danger] }}
                  {...ends}
                />
              </g>
            )
          })
        )}
        {travel && from && party && (
          <line
            className="route travelled"
            x1={from.x}
            y1={from.y}
            x2={party.x}
            y2={party.y}
            aria-hidden="true"
          />
        )}
        {sites.map((s) => {
          const here = s.id === state.location && !travel
          const name = settlementName(state, s.id)
          const classes = [
            'site',
            here && 'here',
            s.id === selected && 'selected',
            reachable.has(s.id) && 'reachable',
          ]
          return (
            <g
              key={s.id}
              className={classes.filter(Boolean).join(' ')}
              data-site={s.id}
              role="button"
              tabIndex={tabStops.has(s.id) ? 0 : -1}
              aria-label={here ? t('map.here', { name }) : name}
              aria-pressed={s.id === selected}
              onClick={() => onSelect(s.id)}
              onKeyDown={onKey(s.id, s.at)}
            >
              <title>{name}</title>
              <rect
                x={s.at.x - marker}
                y={s.at.y - marker}
                width={marker * 2}
                height={marker * 2}
                rx={s.capital ? 4 : 10}
                style={{ stroke: colourOf(s.id) }}
              />
              {overlay && seats.has(s.id) && (
                <path
                  className="crown"
                  d={crownPath(s.at, marker)}
                  style={{ fill: colourOf(s.id) }}
                />
              )}
              {(zoomed || !imageUrl) && (
                <text
                  className="site-label"
                  x={s.at.x}
                  y={s.at.y - marker - 14}
                  textAnchor="middle"
                >
                  {name}
                </text>
              )}
            </g>
          )
        })}
        {pois.map(({ id, at: p, poi, category, icon }) => {
          const here = id === state.location && !travel
          const label = `${poi.name} (${poiCategoryText(t, category)})`
          const r = marker * 0.85
          const classes = [
            'site',
            'poi',
            poi.cleared && 'cleared',
            here && 'here',
            id === selected && 'selected',
            reachable.has(id) && 'reachable',
          ]
          return (
            <g
              key={id}
              className={classes.filter(Boolean).join(' ')}
              data-site={id}
              role="button"
              tabIndex={tabStops.has(id) ? 0 : -1}
              aria-label={here ? t('map.here', { name: label }) : label}
              aria-pressed={id === selected}
              onClick={() => onSelect(id)}
              onKeyDown={onKey(id, p)}
            >
              <title>{label}</title>
              <circle cx={p.x} cy={p.y} r={r} style={{ stroke: colourOf(poi.domain) }} />
              {icon ? (
                <image
                  className="poi-icon"
                  href={icon}
                  x={p.x - r * 0.7}
                  y={p.y - r * 0.7}
                  width={r * 1.4}
                  height={r * 1.4}
                />
              ) : (
                <PoiGlyph category={category} at={p} size={r * 0.7} />
              )}
              {(zoomed || !imageUrl) && (
                <text className="site-label" x={p.x} y={p.y - r - 14} textAnchor="middle">
                  {poi.name}
                </text>
              )}
            </g>
          )
        })}
        {party && (
          <g className="party-marker" data-x={party.x} data-y={party.y} aria-hidden="true">
            <circle className="party-halo" cx={party.x} cy={party.y} r={marker * 3.4} />
            <circle className="party-casing" cx={party.x} cy={party.y} r={marker * 1.9} />
            <circle className="party-ring" cx={party.x} cy={party.y} r={marker * 1.9} />
            <circle className="party-core" cx={party.x} cy={party.y} r={marker * 0.5} />
          </g>
        )}
      </svg>
      <ul className="map-legend small" aria-label={t('map.legend')}>
        {DANGER_COLOURS.map((colour, danger) => (
          <li key={danger}>
            <svg className="legend-swatch" viewBox="0 0 30 10" aria-hidden="true">
              <line className="route-casing" x1={0} y1={5} x2={30} y2={5} />
              <line className="route" x1={0} y1={5} x2={30} y2={5} style={{ stroke: colour }} />
            </svg>
            {dangerText(t, danger)}
          </li>
        ))}
        <li>
          <svg className="legend-swatch" viewBox="0 0 30 10" aria-hidden="true">
            <line className="route-casing sea" x1={0} y1={5} x2={30} y2={5} />
            <line
              className="route sea"
              x1={0}
              y1={5}
              x2={30}
              y2={5}
              style={{ stroke: DANGER_COLOURS[0] }}
            />
          </svg>
          {t('map.sea')}
        </li>
      </ul>
      {overlay && (
        <ul className="map-legend small" aria-label={t('map.kingdomLegend')}>
          {state.world.kingdoms.map((k) => (
            <li key={k.id}>
              <svg className="kingdom-swatch" viewBox="0 0 10 10" aria-hidden="true">
                <rect width={10} height={10} style={{ fill: colours.get(k.id) }} />
              </svg>
              {k.name}
            </li>
          ))}
        </ul>
      )}
      {!imageUrl && <p className="muted small">{t('map.noImage')}</p>}
    </section>
  )
}
