import { useEffect, useRef, useState } from 'react'
import type { Content } from '../../content/build'
import { capitalFirst } from '../../engine/format'
import { delvePreview, type DelvePreview } from '../../engine/world/delve'
import { levelGap } from '../../engine/rules/challenge'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { prefersReducedMotion } from '../dice/DiceRoll'
import { useI18n } from '../i18n/I18n'
import { FUEL_PER_DARK_ROOM } from '../../engine/constants'
import type { RoomLight } from '../../engine/world/dark'

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

/** How long the view takes to pan to the next room (designer call: smooth, not a jump). */
export const PAN_MS = 550
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

/**
 * The view box shown: it eases from where it was to `target` over PAN_MS, in a straight line (it
 * needn't follow the corridors), and jumps at once under reduced motion. A new target mid-pan
 * starts from where the view is.
 */
export function usePannedViewBox(target: string): string {
  const [shown, setShown] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    const from = current.current.split(' ').map(Number)
    const to = target.split(' ').map(Number)
    if (from.every((v, i) => v === to[i])) return
    const show = (box: string) => {
      current.current = box
      setShown(box)
    }
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      show(target)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / PAN_MS))
      const e = easeInOut(k)
      show(k === 1 ? target : from.map((a, i) => (a + (to[i] - a) * e).toFixed(1)).join(' '))
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return shown
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
 * Where the view should be: around the party in a room, or between it and the next room; the
 * whole map when zoomed out.
 */
function targetViewBox(p: DelvePreview, zoomed: boolean): string {
  const { party, next } = positions(p)
  const centre: MapPoint =
    next && !p.inRoom ? [(party[0] + next[0]) / 2, (party[1] + next[1]) / 2] : party
  // While a room is played the map is a low strip, so the encounter below stays in view.
  const aspect = p.inRoom ? ASPECT.room : ASPECT.between
  return delveViewBox(p.dungeon.mapSize, zoomed ? centre : null, aspect)
}

/**
 * A delve (Plan 6 D4): the dungeon's map zoomed to where the party is, with the rooms behind it,
 * its marker and the room ahead; "Whole dungeon" shows all of it. Without the image (no local
 * assets) the rooms are dots on parchment, joined in order. Between rooms: the rooms left, the
 * hoard and Press on or Withdraw. No chance that the next room drives the party out: aggregate
 * predictions stay off the screen (designer call 2026-11-14); each option shows its own odds.
 */
export function DelveView({ content, state, onAction, imageUrl }: Props) {
  const { t } = useI18n()
  const [zoomed, setZoomed] = useState(true)
  const delve = state.delve
  const p = delve ? delvePreview(state, content, delve.poi) : null
  const target = p ? targetViewBox(p, zoomed) : '0 0 1 1'
  const viewBox = usePannedViewBox(target)
  if (!delve || !p) return null
  const { dungeon } = p
  const image = imageUrl === undefined ? assetUrl(dungeon.map) : imageUrl
  const [w, h] = dungeon.mapSize
  const { party, nextIndex } = positions(p)
  const r = Math.max(w, h) / (zoomed ? 90 : 60)
  const xy = (pt: MapPoint) => ({ x: pt[0] * w, y: pt[1] * h })
  const path = [dungeon.entrance, ...dungeon.rooms.map((room) => room.at)]
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xy(pt).x},${xy(pt).y}`)
    .join(' ')
  const current = p.current ?? dungeon.rooms.length
  const nextRoom = dungeon.rooms[nextIndex]
  const between = !p.inRoom && nextRoom !== undefined
  return (
    <section className="panel delve-panel" aria-label={t('delve.heading')}>
      <div className="map-head">
        <h2>{capitalFirst(dungeon.name)}</h2>
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
                {room.dark && (
                  <text
                    className="delve-dark"
                    x={x}
                    y={y + r * 0.42}
                    fontSize={r * 1.3}
                    strokeWidth={r * 0.25}
                  >
                    <title>{t('delve.dark')}</title>☾
                  </text>
                )}
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
        {p.inRoom && p.current !== null && <LightNote light={p.light[p.current]} />}
      </p>
      {between && (
        <>
          <FuelLine preview={p} />
          <p className="small">
            <HoardLine preview={p} />
          </p>
          <div className="actions">
            <button className="primary" onClick={() => onAction({ type: 'pressOn' })}>
              {t('delve.pressOn', { name: nextRoom.name })}
              <LightNote light={p.light[nextIndex]} plain />
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
 * A dark room's lighting as it is or will be played: " · Dark: lit (−1 fuel)", or nothing; `plain`
 * inside a button (no tone).
 */
function LightNote({ light, plain }: { light: RoomLight | null; plain?: boolean }) {
  const { t } = useI18n()
  if (!light) return null
  return (
    <span className={light === 'unlit' && !plain ? 'tone-bad' : undefined}>
      {' · '}
      {t(`delve.light.${light}`, { fuel: FUEL_PER_DARK_ROOM })}
    </span>
  )
}

/**
 * The dark rooms ahead and the fuel they burn (combat design §7b): "Dark rooms ahead: 3 · fuel 2
 * of 3 — the last will be dark". Nothing when no dark room is ahead.
 */
function FuelLine({ preview: p }: { preview: DelvePreview }) {
  const { t } = useI18n()
  const { darkAhead, needed, have, unlitAhead, darkvision } = p.fuel
  if (darkAhead === 0) return null
  const hint = t('delve.fuelHint', { fuel: FUEL_PER_DARK_ROOM })
  if (darkvision) {
    return (
      <p className="small" title={hint}>
        {t('delve.fuelDarkvision', { n: darkAhead })}
      </p>
    )
  }
  const short =
    unlitAhead === 0
      ? ''
      : unlitAhead === darkAhead
        ? t('delve.fuelNone')
        : unlitAhead === 1
          ? t('delve.fuelLast')
          : t('delve.fuelLastMany', { k: unlitAhead })
  return (
    <p className={`small ${unlitAhead > 0 ? 'tone-warn' : ''}`} title={hint}>
      {t('delve.fuel', { n: darkAhead, have: Math.min(have, needed), need: needed })}
      {short}
    </p>
  )
}

/**
 * The hoard at the end, or "?" while the dungeon's level is unknown (suggestedLevel null): its
 * gold, goods and XP come from the CR, so they would give the level away.
 */
function HoardLine({ preview: p }: { preview: DelvePreview }) {
  const { t } = useI18n()
  const { hoard } = p
  if (p.suggestedLevel === null) return <>{t('delve.hoardUnknown')}</>
  const extra =
    (hoard.precious > 0 ? t('delve.hoardPrecious', { n: hoard.precious }) : '') +
    (hoard.accessories === 1
      ? t('delve.hoardAccessory')
      : hoard.accessories > 1
        ? t('delve.hoardAccessories', { n: hoard.accessories })
        : '')
  return (
    <>{t('delve.hoard', { gold: `${hoard.gold.min}–${hoard.gold.max}`, extra, xp: hoard.xp })}</>
  )
}

/**
 * What a site panel says of an authored dungeon before entering: its summary, CR against the
 * party's level, its rooms, the hoard and the rule that a failed room drives the party out.
 */
export function DungeonCard({ preview: p }: { preview: DelvePreview }) {
  const { t } = useI18n()
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
      <FuelLine preview={p} />
      <p className="small">
        <HoardLine preview={p} />
      </p>
      <p className="muted small">{t('delve.rule')}</p>
    </div>
  )
}

/** A site's CR against the party's best level, marked when it is meant for a stronger party. */
export function SiteCr({ cr, level, party }: { cr: number; level: number; party: number }) {
  const { t } = useI18n()
  // One level short is a yellow warning, two or more red (designer call 2026-11-14).
  const gap = levelGap(party, level)
  const tone = gap === 'beyond' ? 'tone-bad' : gap === 'stretch' ? 'tone-warn' : ''
  return (
    <p className={`small ${tone}`}>
      {t('site.cr', { cr, level, party })}
      {gap !== 'ok' && <> {t('site.crHard')}</>}
    </p>
  )
}
