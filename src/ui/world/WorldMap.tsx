import { useState, type KeyboardEvent } from 'react'
import { sortedEntries, type Content } from '../../content/build'
import { routeOptions } from '../../engine/travel/preview'
import { settlementName } from '../../engine/world/geo'
import type { GameState } from '../../schema/state'
import { MAP_HEIGHT, MAP_WIDTH, type MapPoint } from '../../schema/world'
import { useI18n } from '../i18n/I18n'

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
/** The zoomed view: this many map pixels around the party. */
export const ZOOM = { width: 1600, height: 1200 }
/** Half a marker's width, in map pixels (the map's own markers are about 20 px). */
const MARKER = 26

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
 * Altaeus: routes (coloured by danger; sea crossings dashed), settlements outlined in their
 * kingdom's colour, and the party, in a settlement or partway along a road. Settlements are
 * buttons that select.
 */
export function WorldMap({ content, state, selected, onSelect, imageUrl }: Props) {
  const { t } = useI18n()
  const [zoomed, setZoomed] = useState(false)
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
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onSelect(id)
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
        className="world-map"
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
          const classes = [
            'route',
            `danger-${r.danger}`,
            r.terrain === 'sea' && 'sea',
            r.id === shownRoute && 'active',
          ]
          return (
            <line
              key={r.id}
              className={classes.filter(Boolean).join(' ')}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
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
        {sortedEntries(content.settlements).map((s) => {
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
              role="button"
              tabIndex={0}
              aria-label={here ? t('map.here', { name }) : name}
              aria-pressed={s.id === selected}
              onClick={() => onSelect(s.id)}
              onKeyDown={onKey(s.id)}
            >
              <title>{name}</title>
              <rect
                x={s.at.x - MARKER}
                y={s.at.y - MARKER}
                width={MARKER * 2}
                height={MARKER * 2}
                rx={s.capital ? 4 : 10}
                style={{ stroke: colourOf(s.region) }}
              />
              {(zoomed || !imageUrl) && (
                <text
                  className="site-label"
                  x={s.at.x}
                  y={s.at.y - MARKER - 14}
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
            r={MARKER + 18}
            aria-hidden="true"
          />
        )}
      </svg>
      {!imageUrl && <p className="muted small">{t('map.noImage')}</p>}
    </section>
  )
}
