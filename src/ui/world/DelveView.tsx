import { useState } from 'react'
import type { Content } from '../../content/build'
import { delvePreview, type DelvePreview } from '../../engine/world/delve'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { useI18n } from '../i18n/I18n'

/** A point on a dungeon's map as [x, y] fractions of the image. */
type MapPoint = readonly [number, number]

type Props = {
  content: Content
  state: GameState
  onAction: (a: Action) => void
  /** The dungeon's map image (tests pass one; by default it is looked up under assets/). */
  imageUrl?: string | null
}

/** The zoomed view is this share of the widest window of its aspect the map holds. */
const ZOOM = 0.9
/** The zoomed window's width over its height: between rooms, and lower while a room is played. */
const ASPECT = { between: 4 / 3, room: 2.4 }

/**
 * The view box: the whole map, or a window of this aspect (width over height) around `centre`,
 * kept inside the map.
 */
export function delveViewBox(
  size: readonly [number, number],
  centre: MapPoint | null,
  aspect = ASPECT.between
): string {
  const [w, h] = size
  if (!centre) return `0 0 ${w} ${h}`
  const vw = Math.min(w, h * aspect) * ZOOM
  const vh = vw / aspect
  const x = Math.min(Math.max(0, centre[0] * w - vw / 2), w - vw)
  const y = Math.min(Math.max(0, centre[1] * h - vh / 2), h - vh)
  return `${Math.round(x)} ${Math.round(y)} ${Math.round(vw)} ${Math.round(vh)}`
}

/** Where the party stands, and the room it goes to next (null when none is left). */
function positions(p: DelvePreview): { party: MapPoint; next: MapPoint | null; nextIndex: number } {
  const rooms = p.dungeon.rooms
  const at = p.current ?? rooms.length
  const party = p.inRoom ? rooms[at].at : at === 0 ? p.dungeon.entrance : rooms[at - 1].at
  const nextIndex = p.inRoom ? at + 1 : at
  return { party, next: rooms[nextIndex]?.at ?? null, nextIndex }
}

/**
 * A delve (Plan 6 D4): the dungeon's map zoomed to where the party is, with the rooms behind it,
 * its marker and the room ahead; "Whole dungeon" shows all of it. Without the image (no local
 * assets) the rooms are dots on parchment, joined in order. Between rooms: the rooms left, the
 * hoard, the chance the next room drives the party out, and Press on or Withdraw.
 */
export function DelveView({ content, state, onAction, imageUrl }: Props) {
  const { t } = useI18n()
  const [zoomed, setZoomed] = useState(true)
  const delve = state.delve
  const p = delve ? delvePreview(state, content, delve.poi) : null
  if (!delve || !p) return null
  const { dungeon } = p
  const image = imageUrl === undefined ? assetUrl(dungeon.map) : imageUrl
  const [w, h] = dungeon.mapSize
  const { party, next, nextIndex } = positions(p)
  const centre: MapPoint =
    next && !p.inRoom ? [(party[0] + next[0]) / 2, (party[1] + next[1]) / 2] : party
  // While a room is played the map is a low strip, so the encounter below stays in view.
  const aspect = p.inRoom ? ASPECT.room : ASPECT.between
  const viewBox = delveViewBox(dungeon.mapSize, zoomed ? centre : null, aspect)
  const r = Math.max(w, h) / (zoomed ? 90 : 60)
  const xy = (pt: MapPoint) => ({ x: pt[0] * w, y: pt[1] * h })
  const path = [dungeon.entrance, ...dungeon.rooms.map((room) => room.at)]
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xy(pt).x},${xy(pt).y}`)
    .join(' ')
  const current = p.current ?? dungeon.rooms.length
  const nextRoom = dungeon.rooms[nextIndex]
  const between = !p.inRoom && nextRoom !== undefined
  const { hoard } = p
  const extra =
    (hoard.precious > 0 ? t('delve.hoardPrecious', { n: hoard.precious }) : '') +
    (hoard.accessories === 1
      ? t('delve.hoardAccessory')
      : hoard.accessories > 1
        ? t('delve.hoardAccessories', { n: hoard.accessories })
        : '')
  return (
    <section className="panel delve-panel" aria-label={t('delve.heading')}>
      <div className="map-head">
        <h2>{dungeon.name}</h2>
        <div className="map-buttons">
          <button type="button" aria-pressed={!zoomed} onClick={() => setZoomed(!zoomed)}>
            {zoomed ? t('delve.zoomOut') : t('delve.zoomIn')}
          </button>
        </div>
      </div>
      <div className="map-frame">
        <svg
          className={`delve-map ${zoomed ? 'zoomed' : 'full'}`}
          viewBox={viewBox}
          role="img"
          aria-label={t('delve.map', { name: dungeon.name })}
        >
          {image ? (
            <image href={image} x={0} y={0} width={w} height={h} />
          ) : (
            <rect className="map-parchment" x={0} y={0} width={w} height={h} />
          )}
          <path className="delve-path" d={path} />
          <circle
            className="delve-entrance"
            cx={xy(dungeon.entrance).x}
            cy={xy(dungeon.entrance).y}
            r={r * 0.6}
          >
            <title>{t('delve.entrance')}</title>
          </circle>
          {dungeon.rooms.map((room, i) => {
            const { x, y } = xy(room.at)
            const cls =
              i < current ? 'visited' : i === nextIndex ? 'next' : i === current ? 'here' : 'ahead'
            return (
              <g key={room.id} className={`delve-room ${cls}`}>
                <circle cx={x} cy={y} r={r} />
                <text x={x + r * 1.4} y={y + r * 0.45} fontSize={r * 1.4} strokeWidth={r * 0.3}>
                  {i + 1}. {room.name}
                </text>
              </g>
            )
          })}
          <circle className="delve-party" cx={xy(party).x} cy={xy(party).y} r={r * 0.55}>
            <title>{t('delve.you')}</title>
          </circle>
        </svg>
      </div>
      {!image && <p className="muted small">{t('delve.noMap')}</p>}
      <p className="small">
        {p.inRoom && p.current !== null
          ? t('delve.room', {
              n: p.current + 1,
              total: dungeon.rooms.length,
              name: dungeon.rooms[p.current].name,
            })
          : t('delve.roomsLeft', { left: p.roomsLeft, n: dungeon.rooms.length })}
      </p>
      {between && (
        <>
          <p className="small">
            {t('delve.hoard', {
              gold: `${hoard.gold.min}–${hoard.gold.max}`,
              extra,
              xp: hoard.xp,
            })}
          </p>
          {p.risk !== null && (
            <p className={`small ${p.risk >= 0.5 ? 'tone-bad' : 'muted'}`}>
              <RiskLine risk={p.risk} />
            </p>
          )}
          <div className="actions">
            <button className="primary" onClick={() => onAction({ type: 'pressOn' })}>
              {t('delve.pressOn', { name: nextRoom.name })}
            </button>
            <button title={t('delve.withdrawHint')} onClick={() => onAction({ type: 'withdraw' })}>
              {t('delve.withdraw')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * What a site panel says of an authored dungeon before entering: its summary, CR against the
 * party's level, its rooms, the hoard and the rule that a failed room drives the party out.
 */
export function DungeonCard({ preview: p }: { preview: DelvePreview }) {
  const { t } = useI18n()
  const { hoard } = p
  const extra =
    (hoard.precious > 0 ? t('delve.hoardPrecious', { n: hoard.precious }) : '') +
    (hoard.accessories === 1
      ? t('delve.hoardAccessory')
      : hoard.accessories > 1
        ? t('delve.hoardAccessories', { n: hoard.accessories })
        : '')
  return (
    <div className="dungeon-card">
      <p className="small">
        <em>{p.dungeon.summary}</em>
      </p>
      {p.suggestedLevel !== null ? (
        <SiteCr cr={p.cr} level={p.suggestedLevel} party={p.partyLevel} />
      ) : (
        <p className="small muted">{t('delve.levelUnknown')}</p>
      )}
      <p className="small">{t('delve.rooms', { n: p.dungeon.rooms.length })}</p>
      <p className="small">
        {t('delve.hoard', { gold: `${hoard.gold.min}–${hoard.gold.max}`, extra, xp: hoard.xp })}
      </p>
      <p className="muted small">{t('delve.rule')}</p>
      {p.risk !== null && (
        <p className={`small ${p.risk >= 0.5 ? 'tone-bad' : 'muted'}`}>
          <RiskLine risk={p.risk} />
        </p>
      )}
    </div>
  )
}

/** A site's CR against the party's best level, marked when it is meant for a stronger party. */
export function SiteCr({ cr, level, party }: { cr: number; level: number; party: number }) {
  const { t } = useI18n()
  const hard = level > party + 1
  return (
    <p className={`small ${hard ? 'tone-bad' : ''}`}>
      {t('site.cr', { cr, level, party })}
      {hard && <> {t('site.crHard')}</>}
    </p>
  )
}

/** The chance the next room drives the party out, or that it has a way through with no roll. */
function RiskLine({ risk }: { risk: number }) {
  const { t } = useI18n()
  const pct = Math.round(risk * 100)
  return <>{pct === 0 ? t('delve.riskNone') : t('delve.risk', { pct })}</>
}
