import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { sortedEntries, type Content } from '../../content/build'
import { capitalFirst, formatPercent, formatPoints } from '../../engine/format'
import { settlementPoints } from '../../engine/town/reputation'
import type { Action } from '../../engine/state'
import { routeOptions, type RouteOption } from '../../engine/travel/preview'
import { settlementName } from '../../engine/world/geo'
import { edgesFrom, nodeOf } from '../../engine/world/graph'
import { kingdomsByDistance, partyPoint } from '../../engine/world/mapView'
import { siteEmpty } from '../../engine/world/sites'
import { crisisInfo } from '../../engine/crisis/status'
import { territory } from '../../engine/world/territory'
import type { GameState } from '../../schema/state'
import { MAP_HEIGHT, MAP_WIDTH, type Kingdom, type MapPoint } from '../../schema/world'
import { iconUrl } from '../assets'
import { useI18n } from '../i18n/I18n'
import { PoiGlyph, poiCategoryText } from './PoiGlyph'
import { ridden, shownPace, travelAction } from './RoadsOut'
import { dangerText, daysText, paceText, roadReasonMessage, warningMessage } from './travelText'
import { isSevere } from '../../engine/travel/warnings'
import type { TravelPrefs } from './travelPrefs'
import { useGlideShare, type GlideStore } from './autoTravel'
import { SPOT_SPACING_PX } from '../../engine/constants'

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

/**
 * A further colour for the n-th kingdom past the twelfth (a cut-off domain can found its own):
 * hues a golden angle apart, at a depth that reads on the parchment.
 */
function extraColour(n: number): string {
  const h = (n * 137.508 + 20) % 360
  const [s, l] = [0.55, n % 2 === 0 ? 0.36 : 0.46]
  const f = (k: number) => {
    const a = (k + h / 30) % 12
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(a - 3, 9 - a, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Each kingdom's colour by id, in kingdom order; past the twelfth, generated distinct hues. */
export const kingdomColours = (kingdoms: readonly Pick<Kingdom, 'id'>[]): Map<string, string> =>
  new Map(
    kingdoms.map((k, i) => [
      k.id,
      i < KINGDOM_COLOURS.length ? KINGDOM_COLOURS[i] : extraColour(i - KINGDOM_COLOURS.length),
    ])
  )

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
 * The map's frame is 9:8, almost square (designer call, Plan 6 wave 2b: about 32 px taller than
 * the image's own 4:3 in the left column). Both views keep it, so the frame never jumps.
 */
export const VIEW_ASPECT = 9 / 8
/**
 * The zoomed view (the default): this many map pixels around the party, close in (designer
 * decision) yet reaching the neighbours most roads lead to (nine in ten land roads are under
 * 420 px long).
 */
export const ZOOM = { width: 864, height: 768 }
/** The whole map at the frame's aspect: all its height, and a band of its width. */
export const WHOLE = { width: Math.round(MAP_HEIGHT * VIEW_ASPECT), height: MAP_HEIGHT }
/**
 * Half a marker's width, in map pixels (the map's own markers are about 20 px): larger on the
 * whole map, which is drawn at about a fifth of its size, so markers stay easy to see and hit.
 */
const MARKER = { full: 38, zoomed: 26 }
/**
 * Half a marker's outline width, as a share of `MARKER` (theme.css draws the outlines about a
 * fifth of it wide). A marker's invisible hit target starts at its outline's outer edge and
 * reaches 4 screen px past it (a non-scaling stroke, theme.css `.hit`; Plan 6 U3).
 */
const HIT_EDGE = 0.2
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
  /**
   * Travel from the map: with these, a selected marker one road away opens a popover with the
   * road's days, encounters and hostile share at the last pace and foraging chosen, and Travel.
   */
  prefs?: TravelPrefs
  onTravel?: (a: Action) => void
  onClose?: () => void
  /** Auto-travel's glide: on the road the marker moves on through the day under way. */
  glide?: GlideStore
}

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

/**
 * A window around `centre` that stays inside the map; or, zoomed out (or with no party), the whole
 * map's height and the band of its width centred on `span`, the x-extent of what is drawn (the
 * image is 4:3, wider than the frame, and its far edges are sea).
 */
export function viewBoxFor(
  centre: MapPoint | null,
  zoomed: boolean,
  span: { min: number; max: number } = { min: 0, max: MAP_WIDTH }
): string {
  if (!zoomed || !centre) {
    const mid = (span.min + span.max) / 2
    const x = Math.min(Math.max(0, mid - WHOLE.width / 2), MAP_WIDTH - WHOLE.width)
    return `${Math.round(x)} 0 ${WHOLE.width} ${WHOLE.height}`
  }
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
export function WorldMap({
  content,
  state,
  selected,
  onSelect,
  imageUrl,
  prefs,
  onTravel,
  onClose,
  glide,
}: Props) {
  const { t } = useI18n()
  // Zoomed in on the party by default; the view follows it as it moves.
  const [zoomed, setZoomed] = useState(true)
  const [overlay, setOverlay] = useState(loadOverlay)
  const svg = useRef<SVGSVGElement>(null)
  const marker = zoomed ? MARKER.zoomed : MARKER.full
  const edge = marker * HIT_EDGE
  const at = (id: string): MapPoint | null => nodeOf(state, content, id)?.at ?? null
  const travel = state.travel
  const from = travel ? at(travel.from) : null
  // On the road the party is drawn the share of the way it has travelled along its road, gliding
  // on through the day under way while auto-travel runs (only the map re-renders each frame).
  const party = partyPoint(state, content, useGlideShare(glide, state))
  const roads = routeOptions(state, content, prefs?.forage ?? true)
  const reachable = new Set(roads.map((r) => r.to))
  const picked = !travel && prefs && onTravel ? roads.find((r) => r.to === selected) : undefined
  const pickedAt = picked ? at(picked.to) : null
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
  // The Crisis sites the party has found: ringed, and dimmed once quiet (thwarted, or spent).
  const crisisSites = new Map((crisisInfo(state, content)?.sites ?? []).map((s) => [s.poi, s]))
  // Everything the arrow keys move between.
  const markers: { id: string; at: MapPoint }[] = [...sites, ...pois]
  // The whole map shows the band of the image around what is drawn.
  const xs = markers.map((m) => m.at.x)
  const span = xs.length > 0 ? { min: Math.min(...xs), max: Math.max(...xs) } : undefined
  const viewBox = viewBoxFor(party, zoomed, span)
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
      <div className="map-frame">
        <svg
          ref={svg}
          className={`world-map ${zoomed ? 'zoomed' : 'full'}`}
          viewBox={viewBox}
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
                  className="hit"
                  x={s.at.x - marker - edge}
                  y={s.at.y - marker - edge}
                  width={(marker + edge) * 2}
                  height={(marker + edge) * 2}
                  rx={s.capital ? 4 : 10}
                  aria-hidden="true"
                />
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
            const crisis = crisisSites.get(id)
            const name = capitalFirst(poi.name)
            const label = `${name} (${crisis ? t('crisis.mapSite') : poiCategoryText(t, category)})`
            const r = marker * 0.85
            const classes = [
              'site',
              'poi',
              crisis && 'crisis',
              siteEmpty(state.world.seed, id, poi, state.day) && 'cleared',
              crisis?.quiet && 'quiet',
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
                <circle
                  className="hit"
                  cx={p.x}
                  cy={p.y}
                  r={(crisis ? r * 1.45 : r) + edge}
                  aria-hidden="true"
                />
                {crisis && <circle className="crisis-ring" cx={p.x} cy={p.y} r={r * 1.45} />}
                <circle
                  className="poi-disc"
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  style={{ stroke: colourOf(poi.domain) }}
                />
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
                    {name}
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
        {picked && pickedAt && prefs && onTravel && (
          <TravelPopover
            key={picked.to}
            road={picked}
            rep={
              Object.hasOwn(state.world.pois, picked.to) ? null : settlementPoints(state, picked.to)
            }
            prefs={prefs}
            at={pickedAt}
            viewBox={viewBox}
            onTravel={onTravel}
            onClose={onClose}
          />
        )}
      </div>
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
          {kingdomsByDistance(state, content).map((k) => (
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

/**
 * A road picked on the map: its days, encounters and hostile share at the last pace and foraging
 * chosen (and hired mounts, if chosen and offered), the severe warnings (a deadly march, water
 * running out), why it can't be taken, and Travel. Opened from the map, focus moves into it and
 * back to the marker when it closes; Escape closes it.
 */
function TravelPopover({
  road,
  rep,
  prefs,
  at,
  viewBox,
  onTravel,
  onClose,
}: {
  road: RouteOption
  /** The party's reputation points with the town (null for a site). */
  rep: number | null
  prefs: TravelPrefs
  at: MapPoint
  viewBox: string
  onTravel: (a: Action) => void
  onClose?: () => void
}) {
  const { t } = useI18n()
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  // Centred on the marker, but kept inside the map (theme.css sets its width).
  const left = ((at.x - x) / w) * 100
  const top = ((at.y - y) / h) * 100
  const below = top < 40
  const side = {
    left: `clamp(0px, calc(${left}% - min(7.5rem, 50%)), calc(100% - min(15rem, 100%)))`,
  }
  const option = shownPace(road, prefs)
  const riding = ridden(road, prefs)
  const reason = riding ? (option.reason ?? null) : road.reason
  const [min, max] = option.encounters
  const sea = road.terrain === 'sea'
  const severe = option.warnings.filter(isSevere)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Only when opened from the map: a road picked in the roads list keeps the focus there.
    const before = document.activeElement
    if (!before || !box.current?.parentElement?.contains(before)) return
    const first = box.current.querySelector<HTMLButtonElement>('button:not(:disabled)')
    ;(first ?? box.current).focus()
    return () => {
      // Back to the marker (or wherever focus was) unless it has left the page.
      if (before instanceof HTMLElement || before instanceof SVGElement) {
        if (before.isConnected) before.focus()
      }
    }
  }, [])
  return (
    <div
      ref={box}
      className={`map-pop${below ? ' below' : ''}`}
      style={{ ...side, top: `${top}%` }}
      role="dialog"
      tabIndex={-1}
      aria-label={t('mapTravel.label', { name: road.toName })}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <strong>{capitalFirst(road.toName)}</strong>
      {rep !== null && (
        <span className={`small ${rep < 0 ? 'tone-bad' : rep > 0 ? 'tone-good' : 'muted'}`}>
          {' '}
          {t('mapTravel.rep', { points: formatPoints(rep) })}
        </span>
      )}
      <p className="small">
        {max > 0
          ? t('mapTravel.facts', {
              days: daysText(t, option.days),
              min,
              max,
              pct: formatPercent(option.hostile.share),
            })
          : t('mapTravel.factsQuiet', { days: daysText(t, option.days) })}
      </p>
      <p className="muted small">
        {sea
          ? t('route.seaPace')
          : t('mapTravel.pace', {
              pace: paceText(t, option.pace),
              forage: prefs.forage ? t('mapTravel.forage') : '',
              mounted: riding ? t('mapTravel.mounted') : '',
            })}
      </p>
      {severe.length > 0 && (
        <ul className="warnings" aria-label={t('route.warnings')}>
          {severe.map((w) => (
            <li key={w.code} className="severe">
              <span className="warning-icon">☠</span> {warningMessage(t, w)}
            </li>
          ))}
        </ul>
      )}
      {reason && <p className="tone-bad small">{roadReasonMessage(t, reason)}</p>}
      <div className="actions">
        <button
          className="primary"
          disabled={reason !== null}
          aria-label={t('mapTravel.label', { name: road.toName })}
          onClick={() => onTravel(travelAction(road, prefs))}
        >
          {t('route.travel')}
        </button>
        {onClose && (
          <button aria-label={t('mapTravel.close')} onClick={onClose}>
            ×
          </button>
        )}
      </div>
    </div>
  )
}
