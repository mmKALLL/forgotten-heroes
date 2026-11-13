import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { AttackSpec } from '../../engine/combat/attack'
import {
  combatView,
  targetsOf,
  type CombatView as View,
  type IntentView,
  type Target,
  type UnitView,
} from '../../engine/combat/view'
import { formatModifier, formatPercent } from '../../engine/format'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { useI18n, type I18n } from '../i18n/I18n'

// The fight on the line (Plan 7 Track U; combat design §8). It draws the engine's `combatView`
// and dispatches the combat actions; every number comes from `combatPreview`.
// Controls: pick a member (its card, ↑/↓, or the next ready one by default), aim at a target
// (hover, focus, or ←/→), then click it or press Space. F toggles the full action; 1–9 select an
// ability or spell slot (none is playable yet), the same key again deselects it.

const SLOTS = 9

/** A target's identity across renders: an enemy to attack, or a tile to step to. */
const keyOf = (t: Target): string => (t.kind === 'attack' ? `a:${t.target}` : `m:${t.tile}`)
const RETREAT = 'retreat'

type Aim = Target | typeof RETREAT

/** Keys typed into a field, or pressed while a modal is open, are not the fight's. */
function foreign(e: KeyboardEvent): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return true
  if (document.querySelector('[aria-modal="true"]')) return true
  const el = e.target instanceof HTMLElement ? e.target : null
  return el?.closest('input, select, textarea, [contenteditable="true"]') != null
}

export function CombatView({
  state,
  onAction,
}: {
  state: GameState
  onAction: (a: Action) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const view = combatView(state)!
  const [selected, setSelected] = useState<string | null>(null)
  const [aimKey, setAimKey] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [slot, setSlot] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const over = view.result !== null
  const ready = view.members.filter((m) => m.ready)
  // The member acting: the one picked while it can still act, else the next ready one in order.
  const active = ready.find((m) => m.id === selected) ?? ready[0] ?? null
  const options = active ? view.options[active.id] : undefined
  const targets = targetsOf(options)
  const aim: Aim | null =
    aimKey === RETREAT
      ? options?.retreat
        ? RETREAT
        : null
      : (targets.find((x) => keyOf(x) === aimKey) ?? null)
  const canFull = targets.some((x) => x.kind === 'attack' && x.full !== null)
  const useFull = full && canFull

  // A new fight (or its end) starts with the heading, then Close, focused.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  useEffect(() => {
    if (over) closeRef.current?.focus()
  }, [over])

  const reset = () => {
    setAimKey(null)
    setFull(false)
  }

  const act = (target: Aim | null) => {
    if (!active || !target || slot !== null || over) return
    if (target === RETREAT) onAction({ type: 'combatRetreat', unit: active.id })
    else if (target.kind === 'move')
      onAction({ type: 'combatMove', unit: active.id, to: target.tile })
    else
      onAction({
        type: 'combatAct',
        unit: active.id,
        tile: target.tile,
        target: target.target,
        full: useFull && target.full !== null,
      })
    reset()
  }

  const endTurn = () => {
    onAction({ type: 'combatEndTurn' })
    reset()
    setSelected(null)
    // Off the button, so a second Space doesn't end the next turn too.
    headingRef.current?.focus()
  }

  /** Aims at a target and moves focus to its button (the keyboard's roving target). */
  const aimAt = (target: Target) => {
    setAimKey(keyOf(target))
    sectionRef.current?.querySelector<HTMLElement>(`[data-aim="${keyOf(target)}"]`)?.focus()
  }

  const pickMember = (id: string) => {
    setSelected(id)
    reset()
  }

  // The fight's keys, read at the window so they work wherever focus rests on the page.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  onKey.current = (e: KeyboardEvent) => {
    if (over || foreign(e)) return
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key)
      setSlot(slot === n ? null : n)
      e.preventDefault()
      return
    }
    if (e.key === 'f' || e.key === 'F') {
      if (canFull) setFull(!full)
      return
    }
    // The arrows and Space only when focus is on the page or in the fight (the map has its own).
    const el = e.target instanceof HTMLElement ? e.target : null
    const ours = el === null || el === document.body || sectionRef.current?.contains(el)
    if (!ours) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (targets.length === 0) return
      e.preventDefault()
      const at = aim && aim !== RETREAT ? targets.findIndex((x) => keyOf(x) === keyOf(aim)) : -1
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const next = at < 0 ? (dir > 0 ? 0 : targets.length - 1) : at + dir
      aimAt(targets[(next + targets.length) % targets.length])
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (ready.length === 0 || !active) return
      e.preventDefault()
      const at = ready.findIndex((m) => m.id === active.id)
      const next = ready[(at + (e.key === 'ArrowDown' ? 1 : -1) + ready.length) % ready.length]
      pickMember(next.id)
      sectionRef.current?.querySelector<HTMLElement>(`[data-member="${next.id}"]`)?.focus()
    } else if (e.key === ' ') {
      // A focused button takes Space itself (it clicks).
      if (el?.closest('button')) return
      e.preventDefault()
      act(aim)
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const footing = state.combat!.footing
  return (
    <section className="panel combat" aria-label={t('combat.heading')} ref={sectionRef}>
      <div className="combat-head">
        <h2 tabIndex={-1} ref={headingRef}>
          {t('combat.heading')}
        </h2>
        <span className="muted">{t('combat.round', { n: view.round })}</span>
        {footing !== 'normal' && (
          <span
            className={footing === 'edge' ? 'tone-good' : 'tone-bad'}
            title={t(`combat.footingHint.${footing}`)}
          >
            {t(`combat.footing.${footing}`)}
          </span>
        )}
      </div>
      <Line
        view={view}
        i18n={i18n}
        active={over ? null : active}
        targets={over ? [] : targets}
        aim={aim}
        onPick={pickMember}
        onAim={(x) => setAimKey(keyOf(x))}
        onAct={act}
      />
      {over ? (
        <div className="combat-end" role="status">
          <h3>{t(`combat.result.${view.result!}`)}</h3>
          <OutList units={view.out} i18n={i18n} />
          <button
            className="primary"
            ref={closeRef}
            onClick={() => onAction({ type: 'closeCombat' })}
          >
            {t('combat.close')}
          </button>
        </div>
      ) : (
        <>
          {view.out.length > 0 && <OutList units={view.out} i18n={i18n} />}
          <div className="combat-panels">
            <div className="combat-act">
              <p className="combat-acting">
                {active
                  ? t('combat.acting', { name: active.name })
                  : ready.length === 0
                    ? t('combat.allDone')
                    : t('combat.pickMember')}
              </p>
              <div className="combat-controls">
                <button
                  aria-pressed={useFull}
                  disabled={!canFull}
                  title={t('combat.fullHint')}
                  onClick={() => setFull(!full)}
                >
                  {t('combat.full')}
                </button>
                <button
                  disabled={!options?.retreat}
                  title={t('combat.retreatHint')}
                  onMouseEnter={() => options?.retreat && setAimKey(RETREAT)}
                  onFocus={() => options?.retreat && setAimKey(RETREAT)}
                  onClick={() => act(RETREAT)}
                >
                  {t('combat.retreat')}
                </button>
                <span className="spacer" />
                <button className="primary" onClick={endTurn}>
                  {t('combat.endTurn')}
                </button>
              </div>
              <div
                className="combat-slots"
                role="group"
                aria-label={t('combat.slots')}
                title={t('combat.slotsHint')}
              >
                {Array.from({ length: SLOTS }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className="slot"
                    aria-disabled="true"
                    aria-pressed={slot === n}
                    aria-label={t('combat.slot', { n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Preview
                view={view}
                i18n={i18n}
                active={active}
                aim={aim}
                full={useFull}
                slot={slot}
              />
              <p className="muted small combat-keys">{t('combat.keys')}</p>
            </div>
            <Intents view={view} i18n={i18n} />
          </div>
        </>
      )}
      <section className="combat-log-panel" aria-label={t('combat.log')}>
        <h3>{t('combat.log')}</h3>
        <ol className="combat-log" reversed>
          {[...view.log].reverse().map((entry, i) => (
            <li key={view.log.length - i} className={`tone-${entry.tone}`}>
              {entry.text}
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------------------------

function Line({
  view,
  i18n,
  active,
  targets,
  aim,
  onPick,
  onAim,
  onAct,
}: {
  view: View
  i18n: I18n
  active: UnitView | null
  targets: Target[]
  aim: Aim | null
  onPick: (id: string) => void
  onAim: (t: Target) => void
  onAct: (t: Target) => void
}) {
  const { t } = i18n
  const aimed = aim && aim !== RETREAT ? keyOf(aim) : null
  // The tiles an attacking intent will land on.
  const threatened = new Set(
    view.intents
      .filter((i) => !i.stunned && !i.broken && i.attacks.length > 0)
      .map((i) => i.intent.tile)
  )
  const tileOf = new Map(view.tiles.flatMap((tile) => tile.units.map((u) => [u.id, tile.index])))
  return (
    <div className="combat-frame" aria-label={t('combat.line')} title={t('combat.lineHint')}>
      <div className="combat-line" style={{ ['--tiles' as string]: view.line }}>
        <IntentLane view={view} i18n={i18n} tileOf={tileOf} />
        {view.tiles.map((tile) => {
          const here = targets.filter((x) => x.tile === tile.index)
          const move = here.find((x) => x.kind === 'move')
          const first = here[0]
          const click = (e: MouseEvent) => {
            if (first && e.target === e.currentTarget) onAct(first)
          }
          const cls = [
            'tile',
            tile.side ? `side-${tile.side}` : '',
            here.some((x) => x.kind === 'attack') ? 'can-attack' : '',
            move ? 'can-move' : '',
            here.some((x) => keyOf(x) === aimed) ? 'aimed' : '',
            threatened.has(tile.index) ? 'threatened' : '',
          ]
          return (
            // The tile itself takes a mouse click for its first target; its buttons are the
            // keyboard's way in.
            <div
              key={tile.index}
              className={cls.filter(Boolean).join(' ')}
              onClick={click}
              onMouseEnter={() => first && onAim(first)}
              data-tile={tile.index}
            >
              <span className="tile-no" aria-label={t('combat.tile', { n: tile.index + 1 })}>
                {tile.index + 1}
                {threatened.has(tile.index) && (
                  <span className="threat-mark" title={t('combat.threatened')} aria-hidden>
                    ▼
                  </span>
                )}
              </span>
              {tile.units.map((u) => {
                const target = here.find((x) => x.kind === 'attack' && x.target === u.id)
                return (
                  <UnitCard
                    key={u.id}
                    unit={u}
                    i18n={i18n}
                    selected={active?.id === u.id}
                    aimed={target !== undefined && keyOf(target) === aimed}
                    target={target}
                    onPick={onPick}
                    onAim={onAim}
                    onAct={onAct}
                  />
                )
              })}
              {move && active && (
                <button
                  className={`move-here${keyOf(move) === aimed ? ' aimed' : ''}`}
                  data-aim={keyOf(move)}
                  aria-label={t('combat.moveTo', { name: active.name, n: tile.index + 1 })}
                  onMouseEnter={() => onAim(move)}
                  onFocus={() => onAim(move)}
                  onClick={() => onAct(move)}
                >
                  {t('combat.moveHere')}
                  {move.kind === 'move' && move.swings.length > 0 && (
                    <span className="tone-bad" title={t('combat.swingsMark')}>
                      {' '}
                      ⚠
                    </span>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UnitCard({
  unit: u,
  i18n,
  selected,
  aimed,
  target,
  onPick,
  onAim,
  onAct,
}: {
  unit: UnitView
  i18n: I18n
  selected: boolean
  aimed: boolean
  target: Target | undefined
  onPick: (id: string) => void
  onAim: (t: Target) => void
  onAct: (t: Target) => void
}) {
  const { t } = i18n
  const tags: string[] = []
  if (u.boss) tags.push(t('combat.boss'))
  if (u.bloodied) tags.push(t('combat.status.bloodied'))
  if (u.stunned) tags.push(t('combat.status.stunned'))
  else if (u.staggered) tags.push(t('combat.status.staggered'))
  if (u.side === 'party')
    if (!u.ready) tags.push(t('combat.status.done'))
    else if (u.moved) tags.push(t('combat.status.moved'))
    else if (u.acted) tags.push(t('combat.status.acted'))
  const body = (
    <>
      <span className="unit-top">
        <span className="unit-name" title={u.name}>
          {u.name}
        </span>
        <span className="unit-size" title={t(`combat.sizeName.${u.size}`)}>
          {t(`combat.size.${u.size}`)}
        </span>
      </span>
      <span className="hp">
        <span className="hp-fill" style={{ width: `${(100 * Math.max(0, u.hp)) / u.maxHp}%` }} />
        <span className="hp-text">{t('combat.hp', { hp: u.hp, max: u.maxHp })}</span>
      </span>
      {tags.length > 0 && <span className="unit-tags">{tags.join(' · ')}</span>}
      {u.pips && <Pips pips={u.pips} i18n={i18n} />}
    </>
  )
  const cls = `unit side-${u.side}${selected ? ' selected' : ''}${aimed ? ' aimed' : ''}${
    u.side === 'party' && !u.ready ? ' spent' : ''
  }`
  if (u.side === 'party' && u.ready)
    return (
      <button
        className={cls}
        data-member={u.id}
        aria-pressed={selected}
        aria-label={t('combat.select', { name: u.name })}
        onClick={() => onPick(u.id)}
      >
        {body}
      </button>
    )
  if (target)
    return (
      <button
        className={cls}
        data-aim={keyOf(target)}
        aria-label={t('combat.attackUnit', { name: u.name })}
        onMouseEnter={() => onAim(target)}
        onFocus={() => onAim(target)}
        onClick={() => onAct(target)}
      >
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

/** Hits this party turn toward stagger and stun: one pip per hit up to the stun. */
function Pips({ pips, i18n }: { pips: NonNullable<UnitView['pips']>; i18n: I18n }) {
  const label = i18n.t('combat.pips', pips)
  return (
    <span className="pips" role="img" aria-label={label} title={label}>
      {Array.from({ length: pips.stun }, (_, i) => (
        <span
          key={i}
          className={`pip${i < pips.hits ? ' on' : ''}${i === pips.stagger - 1 ? ' stagger' : ''}`}
        />
      ))}
    </span>
  )
}

/** The enemies' intents as arrows over the line, from where each stands to its tile. */
function IntentLane({
  view,
  i18n,
  tileOf,
}: {
  view: View
  i18n: I18n
  tileOf: Map<string, number>
}) {
  if (view.intents.length === 0) return null
  const pct = (tile: number) => `${((tile + 0.5) / view.line) * 100}%`
  return (
    <div className="intent-lane" aria-hidden>
      {view.intents.map((intent, n) => {
        const from = tileOf.get(intent.unit) ?? intent.intent.from
        const to = intent.intent.tile
        const lo = Math.min(from, to)
        const hi = Math.max(from, to)
        const edge = to === 0 ? ' at-start' : to === view.line - 1 ? ' at-end' : ''
        return (
          <div key={intent.unit} className={`intent-row ${intentTone(intent)}`}>
            <span
              className={`arrow ${to < from ? 'to-left' : 'to-right'}`}
              style={{ left: pct(lo), width: `${((hi - lo) / view.line) * 100}%` }}
            />
            <span className={`arrow-label${edge}`} style={{ left: pct(to) }}>
              <b>{n + 1}</b> {arrowLabel(intent, i18n)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const intentTone = (i: IntentView): string =>
  i.stunned || i.broken ? 'idle' : i.attacks.length > 0 ? 'attack' : 'other'

function arrowLabel(i: IntentView, { t }: I18n): string {
  if (i.stunned) return t('combat.arrowStunned')
  if (i.broken) return t('combat.arrowBroken')
  if (i.intent.kind === 'rally') return t('combat.arrowRally')
  if (i.intent.kind === 'move' || i.attacks.length === 0) return t('combat.arrowMove')
  const a = i.attacks[0]
  // A volley or a spell attacks everyone on the tile (acting twice is said in the panel).
  const times = i.attacks.length
  const odds = t('combat.arrowOdds', {
    hit: formatPercent(a.hit),
    min: a.damage[0],
    max: a.damage[1],
  })
  return times > 1 ? `${odds} ×${times}` : odds
}

function OutList({ units, i18n }: { units: UnitView[]; i18n: I18n }) {
  if (units.length === 0) return null
  return (
    <p className="combat-out small">
      <span className="muted">{i18n.t('combat.out')}</span>{' '}
      {units.map((u, i) => (
        <span key={u.id} className={u.side === 'party' ? 'tone-bad' : 'muted'}>
          {i > 0 && ', '}
          {u.name} ({i18n.t(`combat.status.${u.status === 'in' ? 'down' : u.status}`)})
        </span>
      ))}
    </p>
  )
}

// ---------------------------------------------------------------------------------------------
// The preview and the intents
// ---------------------------------------------------------------------------------------------

function SpecLines({ spec, i18n, second }: { spec: AttackSpec; i18n: I18n; second?: boolean }) {
  const { t } = i18n
  const parts = spec.parts.map((p) => `${formatModifier(p.value)} ${p.label}`).join(', ')
  return (
    <div className="spec">
      {second && <p className="muted small">{t('combat.previewSecond')}</p>}
      <p className="small" title={parts}>
        {t('combat.roll', { mod: formatModifier(spec.modifier), ac: spec.ac })}
        {t(`combat.rollMode.${spec.mode}`)}
      </p>
      <p>
        <strong>{t('combat.hit', { pct: formatPercent(spec.hit) })}</strong> ·{' '}
        {t('combat.damage', { min: spec.damage[0], max: spec.damage[1] })}
        {spec.half && t('combat.halfDamage')} ·{' '}
        <span className="muted">
          {t('combat.crit', {
            pct: formatPercent(spec.crit),
            min: spec.critDamage[0],
            max: spec.critDamage[1],
          })}
        </span>
      </p>
    </div>
  )
}

function Swings({ swings, view, i18n }: { swings: AttackSpec[]; view: View; i18n: I18n }) {
  const { t } = i18n
  if (swings.length === 0) return <p className="muted small">{t('combat.noSwings')}</p>
  const name = (id: string) => view.tiles.flatMap((x) => x.units).find((u) => u.id === id)?.name
  return (
    <>
      <p className="tone-bad small">{t('combat.swings')}</p>
      <ul className="small">
        {swings.map((s, i) => (
          <li key={i}>
            {t('combat.swing', {
              name: name(s.attacker) ?? s.attacker,
              pct: formatPercent(s.hit),
              min: s.damage[0],
              max: s.damage[1],
            })}
          </li>
        ))}
      </ul>
    </>
  )
}

function Preview({
  view,
  i18n,
  active,
  aim,
  full,
  slot,
}: {
  view: View
  i18n: I18n
  active: UnitView | null
  aim: Aim | null
  full: boolean
  slot: number | null
}) {
  const { t } = i18n
  const body = () => {
    if (slot !== null) return <p className="muted">{t('combat.slotChosen', { n: slot })}</p>
    if (!active || !aim) return <p className="muted">{t('combat.previewNone')}</p>
    if (aim === RETREAT) {
      const swings = view.options[active.id]?.retreat?.swings ?? []
      return (
        <>
          <h3>{t('combat.previewRetreat', { name: active.name })}</h3>
          <Swings swings={swings} view={view} i18n={i18n} />
        </>
      )
    }
    if (aim.kind === 'move')
      return (
        <>
          <h3>{t('combat.previewMove', { name: active.name, n: aim.tile + 1 })}</h3>
          <Swings swings={aim.swings} view={view} i18n={i18n} />
        </>
      )
    const specs = full && aim.full ? aim.full : aim.attack
    const target = view.tiles.flatMap((x) => x.units).find((u) => u.id === aim.target)
    const notes: string[] = []
    if (specs[0]?.onHit) notes.push(t(`combat.onHit.${specs[0].onHit}`))
    if (active.staggersOnHit) notes.push(t('combat.traitStagger'))
    if (specs[0]?.cleave) notes.push(t('combat.cleave'))
    return (
      <>
        <h3>{t('combat.previewAttack', { attacker: active.name, target: target?.name ?? '' })}</h3>
        {specs.map((s, i) => (
          <SpecLines key={i} spec={s} i18n={i18n} second={i > 0} />
        ))}
        {notes.length > 0 && <p className="small">{notes.join(' ')}</p>}
      </>
    )
  }
  return (
    <div
      className="combat-preview"
      role="region"
      aria-label={t('combat.preview')}
      aria-live="polite"
    >
      {body()}
    </div>
  )
}

function Intents({ view, i18n }: { view: View; i18n: I18n }) {
  const { t } = i18n
  const m = view.morale
  return (
    <section className="combat-intents" aria-label={t('combat.intents')}>
      <h3 title={t('combat.intentsHint')}>{t('combat.intents')}</h3>
      {view.intents.length === 0 ? (
        <p className="muted small">{t('combat.intentsNone')}</p>
      ) : (
        <ol className="intent-list">
          {view.intents.map((i) => {
            const on = [...new Set(i.attacks.map((a) => a.targetName))]
            return (
              <li key={i.unit} className={intentTone(i)}>
                <b>{i.name}</b>{' '}
                {i.stunned
                  ? t('combat.intentStunned')
                  : t(`combat.intent.${i.intent.kind}`, { tile: i.intent.tile + 1 })}
                {!i.stunned && i.broken && (
                  <span className="muted">: {t('combat.intentBroken')}</span>
                )}
                {!i.stunned && !i.broken && on.length > 0 && (
                  <span className="muted"> ({t('combat.intentOn', { names: on.join(', ') })})</span>
                )}
                {i.intent.twice && !i.stunned && (
                  <span className="tone-bad small"> {t('combat.intentTwice')}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {m && m.state === 'held' && <p className="muted small">{t('combat.moraleHeld')}</p>}
      {m && m.state === 'untested' && m.threshold !== null && (
        <p className="muted small">
          {t('combat.morale', { n: m.threshold, dc: m.dc, pct: formatPercent(m.flee) })}
        </p>
      )}
    </section>
  )
}
