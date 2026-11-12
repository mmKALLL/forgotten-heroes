import { useRef, useState, type KeyboardEvent } from 'react'
import { sortedEntries, type Content } from '../../content/build'
import { routeOptions } from '../../engine/travel/preview'
import { settlementName } from '../../engine/world/geo'
import type { GameState } from '../../schema/state'
import { MAP_HEIGHT, MAP_WIDTH, type MapPoint } from '../../schema/world'
import { useI18n } from '../i18n/I18n'
import { dangerText } from './travelText'

/** Marker outlines by kingdom, in kingdom order. They read on the parchment map in both themes. */
export const KINGDOM_COLOURS = [
  '#9c2f24',
  '#2f5c8a',
  '#3f6b35',
  '#7b3f1d',
  '#6a3f8a',
  '#b58500',
  '#2f7a7a',
  '#8a2f5c',
]
/**
 * Road colours by danger (0 Safe to 3 Deadly): pale to dark red, so the scale reads by lightness
 * as well as hue. Fixed rather than themed, since they sit on the same map image in both themes;
 * a dark casing under each road keeps the pale ones visible.
 */
export const DANGER_COLOURS = ['#f4ead2', '#f0b429', '#e0662b', '#b51f18'] as const
/** The zoomed view: this many map pixels around the party. */
export const ZOOM = { width: 1600, height: 1200 }
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
  /** The settlement whose details (and road) are shown. */
  selected: string | null
  onSelect: (settlementId: string) => void
  /** The Altaeus map image (a local asset), or null to draw on plain parchment. */
  imageUrl: string | null
}

const lerp = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** The whole map, or a window around `centre` that stays inside the map. */
export function viewBoxFor(centre: MapPoint | null, zoomed: boolean): string {
  if (!zoomed || !centre) return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`
  const x = Math.min(Math.max(0, centre.x - ZOOM.width / 2), MAP_WIDTH - ZOOM.width)
  const y = Math.min(Math.max(0, centre.y - ZOOM.height / 2), MAP_HEIGHT - ZOOM.height)
  return `${Math.round(x)} ${Math.round(y)} ${ZOOM.width} ${ZOOM.height}`
}

/**
 * The settlement nearest `from` in the direction `dir` (a unit vector), favouring those straight
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
 * in their kingdom's colour, and the party, in a settlement or partway along a road. Settlements
 * are buttons that select. Only the party's place, the roads' ends and the selection are tab
 * stops; the arrow keys move between all settlements.
 */
export function WorldMap({ content, state, selected, onSelect, imageUrl }: Props) {
  const { t } = useI18n()
  const [zoomed, setZoomed] = useState(false)
  const svg = useRef<SVGSVGElement>(null)
  const marker = zoomed ? MARKER.zoomed : MARKER.full
  const at = (id: string): MapPoint | null =>
    Object.hasOwn(content.settlements, id) ? content.settlements[id].at : null
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
  const colours = new Map(
    state.world.kingdoms.map((k, i) => [k.id, KINGDOM_COLOURS[i % KINGDOM_COLOURS.length]])
  )
  const colourOf = (region: string) =>
    Object.hasOwn(state.world.regions, region)
      ? colours.get(state.world.regions[region].kingdom)
      : undefined
  const sites = sortedEntries(content.settlements)
  // Roving tab stops: where the party is (or is headed), where it can go, and the selection.
  const tabStops = new Set(reachable)
  if (state.location) tabStops.add(state.location)
  if (travel) tabStops.add(travel.to)
  if (selected) tabStops.add(selected)
  if (tabStops.size === 0 && sites.length > 0) tabStops.add(sites[0].id)
  const onKey = (id: string, at: MapPoint) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
      return
    }
    if (!Object.hasOwn(ARROWS, e.key)) return
    e.preventDefault()
    const next = nearestInDirection(at, ARROWS[e.key], sites)
    if (!next) return
    svg.current?.querySelector<SVGGElement>(`[data-site="${next}"]`)?.focus()
  }

  return (
    <section className="panel map-panel" aria-label={t('map.heading')}>
      <div className="map-head">
        <h2>{t('map.heading')}</h2>
        <button type="button" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>
          {zoomed ? t('map.zoomOut') : t('map.zoomIn')}
        </button>
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
                style={{ stroke: colourOf(s.region) }}
              />
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
        {party && (
          <circle
            className="party-marker"
            cx={party.x}
            cy={party.y}
            r={marker + 18}
            aria-hidden="true"
          />
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
      {!imageUrl && <p className="muted small">{t('map.noImage')}</p>}
    </section>
  )
}
