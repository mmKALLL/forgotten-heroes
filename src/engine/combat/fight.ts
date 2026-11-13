import type { Content } from '../../content/build'
import type { CombatLogEntry, CombatState, CombatUnit, Intent } from '../../schema/combat'
import type { Fight } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import type { CombatResult, Good, LogTone } from '../../schema/types'
import { appendLog } from '../log'
import { withRng, type Draw } from '../rng'
import { formatModifier } from '../format'
import { statLabel } from '../rules/abilities'
import { setbackCamaraderie } from '../encounters/outcomes'
import { resolveFightBranch } from '../encounters/run'
import { changeCamaraderie, livingMembers } from '../town/camaraderie'
import { MAX_EXHAUSTION } from '../rules/character'
import {
  CAMARADERIE_DOWNED,
  CAMARADERIE_WIPE,
  DOWNED_EXHAUSTION,
  WEAPON_FAMILY_RULES,
} from '../constants'
import { attackSpec, hitWeight, rollAttack, rollDamage, type AttackSpec, type Part } from './attack'
import {
  applyDefeat,
  defeatOdds,
  exhaustDowned,
  livingOf,
  rollDefeat,
  rollStruggle,
  wipeOptions,
  type WipeChoice,
} from './defeat'
import { actionOrder, infightTarget, infighting, planIntents, repositionTile } from './intents'
import { useAbility, type AbilityAction } from './abilities'
import { darkFooting, roomUnlit } from '../world/dark'
import {
  canEnter,
  distance,
  engagedWith,
  isStunned,
  sideUnits,
  standing,
  unitById,
  unitsOn,
  withUnit,
} from './line'
import { moraleDc, moraleDue, rollMorale } from './morale'
import {
  lineLength,
  placeUnits,
  rollSurprise,
  rollUnits,
  surprisePreview,
  type StartOptions,
} from './start'

// A fight on the line (Plan 7, combat design §2–§7), played through `step`. The party acts first
// each round, members in any order: each moves one tile and acts, or stands and takes a full
// action (by weapon family). Ending the turn lets the enemies act on their telegraphed intents,
// left to right and top to bottom. Every roll uses the same specs the preview shows
// (combat/preview.ts): preview == actual. The fight ends in victory, a rout, a retreat or a wipe;
// the ending's branch then applies to the open encounter, and `closeCombat` (or any other action)
// clears it. A wipe waits for the player's choice (`combatWipeChoice`: surrender, struggle or
// sacrifice), which applies its cost and the `lose` branch and closes the fight.

export type CombatAction =
  /**
   * Open the fight of the encounter on hand (its situation's `fight`), or the given `fight` (the
   * developer tools' test fight; with no encounter open, its branches apply to nothing).
   */
  | { type: 'startCombat'; fight?: Fight }
  /** A member steps one tile (free swings from enemies left behind). */
  | { type: 'combatMove'; unit: string; to: number }
  /** A member attacks a tile (its top enemy, or `target`); `full` stands still for the full action. */
  | { type: 'combatAct'; unit: string; tile: number; target?: string; full?: boolean }
  /** A member at the party's end of the line leaves the fight. */
  | { type: 'combatRetreat'; unit: string }
  /** The party's turn ends: the enemies act, and a new round begins. */
  | { type: 'combatEndTurn' }
  /** Clear a finished fight (not a wipe: that waits for its choice). */
  | { type: 'closeCombat' }
  /** A member uses a class ability (a 1–9 slot) on a tile or a unit (combat/abilities.ts). */
  | AbilityAction
  /** After a wipe: how the party gets out of it; `member` stays behind for a sacrifice. */
  | { type: 'combatWipeChoice'; choice: WipeChoice; member?: string }

export const COMBAT_ACTIONS: readonly string[] = [
  'startCombat',
  'combatMove',
  'combatAct',
  'combatRetreat',
  'combatEndTurn',
  'closeCombat',
  'combatAbility',
  'combatWipeChoice',
]

/** A fight is open and undecided. */
export const fighting = (state: Pick<GameState, 'combat'>): boolean =>
  state.combat !== null && state.combat.result === null

// ---------------------------------------------------------------------------------------------
// Small helpers on the state
// ---------------------------------------------------------------------------------------------

const combatOf = (s: GameState): CombatState => s.combat!
const unit = (s: GameState, id: string): CombatUnit => unitById(combatOf(s), id)!
const setCombat = (s: GameState, combat: CombatState): GameState => ({ ...s, combat })
const setUnit = (s: GameState, u: CombatUnit): GameState => setCombat(s, withUnit(combatOf(s), u))

function log(s: GameState, text: string, tone: LogTone, attack?: CombatLogEntry['attack']) {
  const entry: CombatLogEntry = attack ? { text, tone, attack } : { text, tone }
  return setCombat(s, { ...combatOf(s), log: [...combatOf(s).log, entry] })
}

/** A member's HP follows their unit's. */
const syncHp = (s: GameState, id: string, hp: number): GameState => ({
  ...s,
  party: s.party.map((c) => (c.id === id ? { ...c, hp: Math.max(0, hp) } : c)),
})

// ---------------------------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------------------------

const SURPRISE_LINES: Record<CombatState['surprise'], string> = {
  party: 'The party has the jump on them: the enemies lose their first turn.',
  enemy: 'Caught unawares: the enemies strike first.',
  half: 'Half the party is caught flat-footed: only the quickest act in the first round.',
  none: 'Both sides see each other coming.',
}

/**
 * Opens a fight (combat design §2): units, placement, the surprise roll and the first intents.
 * The party's footing (Edge or Exposed) holds for the whole fight; in an unlit dungeon room it is
 * Exposed on top (world/dark.ts), whoever opens the fight. A lit room is lit along the whole line.
 */
export function startCombat(
  state: GameState,
  content: Content,
  fight: Fight,
  options: StartOptions = {}
): GameState {
  if (fighting(state)) return state
  const [opened, rng] = withRng(state.rng, (draw) => {
    const line = lineLength(fight)
    const rolled = rollUnits(draw, state, content, fight)
    const units = placeUnits(
      line,
      rolled.party,
      rolled.enemies,
      rolled.ambushers,
      rolled.place,
      content
    )
    const enemies = units.filter((u) => u.side === 'enemy')
    const preview = surprisePreview(state, content, enemies, fight.ambush)
    const surprise = rollSurprise(draw, preview, fight.ambush)
    // With `half`, only the quickest half (by DEX, rounded up) act in round 1.
    const members = rolled.party.map((p) => p.unit)
    const dex = (id: string) => state.party.find((c) => c.id === id)?.abilities.dex ?? 0
    const quick = [...members]
      .map((u, i) => ({ u, i }))
      .sort((a, b) => dex(b.u.id) - dex(a.u.id) || a.i - b.i)
      .slice(0, Math.ceil(members.length / 2))
      .map(({ u }) => u.id)
    const half = surprise.result === 'half'
    const combat: CombatState = {
      line,
      round: 1,
      units: units.map((u) =>
        half && u.side === 'party' && !quick.includes(u.id) ? { ...u, moved: true, acted: true } : u
      ),
      // In an unlit dungeon room the party fights Exposed on top (world/dark.ts, design §7b).
      footing: darkFooting(options.footing ?? 'normal', roomUnlit(state)),
      surprise: surprise.result,
      firstMovers: half ? quick : [],
      groupSize: enemies.length,
      morale: 'untested',
      fight,
      result: null,
      log: [],
    }
    const who = state.party.find((c) => c.id === preview.actorId)?.name ?? 'No one'
    let s: GameState = setCombat(state, combat)
    s = log(
      s,
      `${who} rolls ${statLabel(preview.skill)} for surprise: ${surprise.kept} ` +
        `${formatModifier(preview.modifier)} vs DC ${preview.dc}. ${SURPRISE_LINES[surprise.result]}`,
      surprise.result === 'enemy' || surprise.result === 'half' ? 'bad' : 'info'
    )
    // An enemy free round: they act before the party's first turn, without telegraphing.
    if (surprise.result === 'enemy') {
      s = setCombat(s, planIntents(draw, combatOf(s), content))
      s = enemyTurn(s, draw, content)
    }
    if (combatOf(s).result === null && surprise.result !== 'party')
      s = setCombat(s, planIntents(draw, combatOf(s), content))
    return s
  })
  const foes = opened.combat!.units.filter((u) => u.side === 'enemy').length
  const started = appendLog(
    { ...opened, rng },
    `A fight breaks out: ${foes} foes on the line.`,
    'bad'
  )
  // An enemy free round may already have decided it.
  return settle(started, content)
}

// ---------------------------------------------------------------------------------------------
// Resolving attacks, damage and defeat
// ---------------------------------------------------------------------------------------------

/** Takes damage: an enemy at 0 HP is dead (and morale may break); a member goes down. */
function hurt(
  s: GameState,
  draw: Draw,
  targetId: string,
  amount: number,
  content: Content
): GameState {
  const target = unit(s, targetId)
  const hp = target.hp - amount
  if (hp > 0) {
    const next = setUnit(s, { ...target, hp })
    return target.side === 'party' ? syncHp(next, target.id, hp) : next
  }
  if (target.side === 'enemy') {
    let next = log(
      setUnit(s, { ...target, hp: 0, status: 'dead' }),
      `${target.name} falls.`,
      'good'
    )
    if (moraleDue(combatOf(next))) next = testMorale(next, draw)
    return next
  }
  return downMember(s, draw, target, amount - target.hp, content)
}

/**
 * A member at 0 HP: out of the fight, camaraderie lost for good, DOWNED_EXHAUSTION (death at 6,
 * gear lost), and otherwise the injury roll.
 */
function downMember(
  s: GameState,
  draw: Draw,
  target: CombatUnit,
  overkill: number,
  _content: Content
): GameState {
  let next = syncHp(setUnit(s, { ...target, hp: 0, status: 'down' }), target.id, 0)
  const line = `${target.name} goes down: +${DOWNED_EXHAUSTION} exhaustion.`
  next = appendLog(log(next, line, 'bad'), line, 'bad')
  next = changeCamaraderie(next, -CAMARADERIE_DOWNED, `${target.name} went down`)
  const found = next.party.find((c) => c.id === target.id)
  if (!found) return next
  const member = exhaustDowned(found)
  if (member.exhaustion >= MAX_EXHAUSTION) {
    const dead = `${member.name} doesn't get up again, and their gear is lost with them.`
    next = {
      ...next,
      party: next.party.map((c) => (c.id === member.id ? applyDefeat(c, { kind: 'death' }) : c)),
    }
    next = setUnit(next, { ...unit(next, target.id), status: 'dead' })
    return appendLog(log(next, dead, 'crit'), dead, 'crit')
  }
  next = { ...next, party: next.party.map((c) => (c.id === member.id ? member : c)) }
  const defeat = rollDefeat(draw, defeatOdds(next, member, overkill))
  next = {
    ...next,
    party: next.party.map((c) => (c.id === member.id ? applyDefeat(c, defeat) : c)),
  }
  if (defeat.kind === 'injury') {
    const line = `${member.name} takes a lasting wound (−2 ${statLabel(defeat.ability)}).`
    next = appendLog(log(next, line, 'bad'), line, 'bad')
  } else if (defeat.kind === 'death') {
    const line = `${member.name} dies of their wounds, and their gear is lost with them.`
    next = setUnit(next, { ...unit(next, target.id), status: 'dead' })
    next = appendLog(log(next, line, 'crit'), line, 'crit')
  }
  return next
}

/** The enemies left test their morale; on a break they flee off their end of the line. */
function testMorale(s: GameState, draw: Draw): GameState {
  const combat = combatOf(s)
  const left = sideUnits(combat, 'enemy')
  const dc = moraleDc(combat, s.party)
  const flee = rollMorale(draw, left, dc)
  if (!flee)
    return log(setCombat(s, { ...combat, morale: 'held' }), 'The enemies hold their ground.', 'bad')
  const units = combat.units.map((u) =>
    u.side === 'enemy' && standing(u) ? { ...u, status: 'fled' as const } : u
  )
  return log(
    setCombat(s, { ...combat, morale: 'broke', units }),
    'Their nerve breaks: the enemies flee.',
    'good'
  )
}

/** Rolls one attack by its spec, and applies it. Hits on enemies count only in the party's turn. */
function strike(
  s: GameState,
  draw: Draw,
  spec: AttackSpec,
  partyTurn: boolean,
  content: Content
): GameState {
  const roll = rollAttack(draw, spec)
  const attacker = unit(s, spec.attacker)
  const target = unit(s, spec.target)
  const range = roll.crit ? spec.critDamage : spec.damage
  const outcome = roll.hit
    ? `${roll.crit ? 'a critical hit' : 'a hit'} for ${roll.damage}`
    : 'a miss'
  let next = log(
    s,
    `${attacker.name} attacks ${target.name}: ${roll.kept} ${formatModifier(spec.modifier)} vs AC ${spec.ac}, ${outcome}.`,
    roll.hit === (attacker.side === 'party') ? 'good' : 'bad',
    {
      attacker: attacker.id,
      target: target.id,
      chance: spec.hit,
      kept: roll.kept,
      modifier: spec.modifier,
      hit: roll.hit,
      crit: roll.crit,
      range,
      damage: roll.damage,
    }
  )
  if (!roll.hit) return next
  // Hits climb the ladder (stifled, staggered, stunned); a mace's count double.
  if (target.side === 'enemy') {
    const t = unit(next, target.id)
    next = setUnit(next, { ...t, hits: t.hits + (partyTurn ? hitWeight(attacker) : 0) })
  }
  next = hurt(next, draw, target.id, roll.damage, content)
  // An axe's crit also hits a second enemy on that tile.
  if (roll.crit && spec.cleave) {
    const second = unitsOn(combatOf(next), target.tile, target.side).find((u) => u.id !== target.id)
    if (second) {
      const damage = rollDamage(draw, attacker.damage, false, false)
      next = log(next, `The blow carries on into ${second.name} for ${damage}.`, 'good')
      next = setUnit(next, { ...second, hits: second.hits + (partyTurn ? 1 : 0) })
      next = hurt(next, draw, second.id, damage, content)
    }
  }
  return next
}

/** The enemies a unit leaving its tile for `to` (−1: off the line) gives a free swing. */
export function freeSwingers(combat: CombatState, mover: CombatUnit, to: number): CombatUnit[] {
  return engagedWith(combat, mover).filter(
    (u) => u.reach[0] <= 1 && !isStunned(u) && (to < 0 || distance(u.tile, to) !== 1)
  )
}

/** The free swings a move would draw, as specs (preview and resolution alike). */
export const swingSpecs = (combat: CombatState, mover: CombatUnit, to: number): AttackSpec[] =>
  freeSwingers(combat, mover, to).map((u) => attackSpec(combat, u, mover))

/** One step, braving the free swings (unless `free`). Returns the state; the mover may be down. */
function stepTo(
  s: GameState,
  draw: Draw,
  moverId: string,
  to: number,
  free: boolean,
  partyTurn: boolean,
  content: Content
): GameState {
  let next = s
  if (!free) {
    for (const swinger of freeSwingers(combatOf(next), unit(next, moverId), to)) {
      const mover = unit(next, moverId)
      const current = unit(next, swinger.id)
      if (!standing(mover) || !standing(current)) break
      next = log(next, `${current.name} takes a free swing at ${mover.name}.`, 'info')
      next = strike(next, draw, attackSpec(combatOf(next), current, mover), partyTurn, content)
    }
  }
  const mover = unit(next, moverId)
  if (!standing(mover)) return next
  return setUnit(next, { ...mover, tile: to })
}

// ---------------------------------------------------------------------------------------------
// The party's actions
// ---------------------------------------------------------------------------------------------

/** A member who may still do something this turn. */
const ready = (s: GameState, id: string): CombatUnit | null => {
  if (!fighting(s)) return null
  const u = unitById(combatOf(s), id)
  return u && u.side === 'party' && standing(u) ? u : null
}

/** Whether a member may step to `to` now. */
export function canMove(combat: CombatState, u: CombatUnit, to: number): boolean {
  return !u.moved && distance(u.tile, to) === 1 && canEnter(combat, u, to)
}

/**
 * The attacks a member makes on a tile: one, or the weapon's full action (a second attack at a
 * penalty, or one with a bonus). Specs are against the target as things stand; null when the
 * attack can't be made.
 */
export function attackPlan(
  combat: CombatState,
  attacker: CombatUnit,
  tile: number,
  full: boolean,
  targetId?: string
): { target: CombatUnit; extras: Part[][]; specs: AttackSpec[] } | null {
  if (attacker.acted || (full && attacker.moved)) return null
  const d = distance(attacker.tile, tile)
  if (d < attacker.reach[0] || d > attacker.reach[1]) return null
  const foes = unitsOn(combat, tile, 'enemy')
  const target = targetId ? foes.find((u) => u.id === targetId) : foes[0]
  if (!target) return null
  const rule = WEAPON_FAMILY_RULES[attacker.family ?? 'daggers'].full
  const extras: Part[][] = !full
    ? [[]]
    : rule.kind === 'bonus'
      ? [[{ label: 'full action', value: rule.amount }]]
      : [[], [{ label: 'second attack', value: -rule.penalty }]]
  return {
    target,
    extras,
    specs: extras.map((extra) => attackSpec(combat, attacker, target, { extra, full })),
  }
}

function act(
  s: GameState,
  draw: Draw,
  action: Extract<CombatAction, { type: 'combatAct' }>,
  content: Content
): GameState {
  const attacker = ready(s, action.unit)
  if (!attacker) return s
  const plan = attackPlan(combatOf(s), attacker, action.tile, action.full ?? false, action.target)
  if (!plan) return s
  let next = s
  plan.extras.forEach((extra, i) => {
    const a = unit(next, attacker.id)
    if (!standing(a) || combatOf(next).result !== null || combatOf(next).morale === 'broke') return
    // A second attack goes at the same foe, or the next one on the tile if it fell.
    const first = unit(next, plan.target.id)
    const target = standing(first) ? first : unitsOn(combatOf(next), action.tile, 'enemy')[0]
    if (!target) return
    const spec =
      i === 0 ? plan.specs[0] : attackSpec(combatOf(next), a, target, { extra, full: action.full })
    next = strike(next, draw, spec, true, content)
  })
  const a = unit(next, attacker.id)
  return setUnit(next, { ...a, acted: true, moved: a.moved || (action.full ?? false) })
}

function move(
  s: GameState,
  draw: Draw,
  action: Extract<CombatAction, { type: 'combatMove' }>,
  content: Content
): GameState {
  const mover = ready(s, action.unit)
  if (!mover || !canMove(combatOf(s), mover, action.to)) return s
  const next = stepTo(s, draw, mover.id, action.to, false, true, content)
  const after = unit(next, mover.id)
  return standing(after) ? setUnit(next, { ...after, moved: true }) : next
}

/** Whether a member may leave the fight now: at the party's end of the line, not yet moved. */
export const canRetreat = (u: CombatUnit): boolean => u.tile === 0 && !u.moved

function retreat(s: GameState, draw: Draw, id: string, content: Content): GameState {
  const member = ready(s, id)
  if (!member || !canRetreat(member)) return s
  let next = s
  for (const swinger of freeSwingers(combatOf(next), member, -1)) {
    const m = unit(next, id)
    if (!standing(m)) break
    next = log(next, `${swinger.name} takes a free swing at ${m.name}.`, 'info')
    next = strike(next, draw, attackSpec(combatOf(next), unit(next, swinger.id), m), true, content)
  }
  const m = unit(next, id)
  if (!standing(m)) return next
  return log(
    setUnit(next, { ...m, status: 'left', moved: true, acted: true }),
    `${m.name} gets away.`,
    'info'
  )
}

// ---------------------------------------------------------------------------------------------
// The enemies' turn
// ---------------------------------------------------------------------------------------------

/** The units an intent hits when it lands: the top one, or everyone there for a volley or spell. */
export function intentTargets(combat: CombatState, intent: Intent): CombatUnit[] {
  const there = unitsOn(combat, intent.tile, 'party')
  return intent.kind === 'volley' || intent.kind === 'area' ? there : there.slice(0, 1)
}

/** Whether an intent from `from` still reaches someone on its tile. */
export function intentLands(combat: CombatState, u: CombatUnit, intent: Intent, from = u.tile) {
  const d = distance(from, intent.tile)
  return d >= u.reach[0] && d <= u.reach[1] && unitsOn(combat, intent.tile, 'party').length > 0
}

/** One enemy's action: approach, then act on its tile (or, broken, reposition). */
function enemyAct(
  s: GameState,
  draw: Draw,
  id: string,
  intent: Intent,
  rally: boolean,
  content: Content
): [GameState, boolean] {
  let next = s
  let u = unit(next, id)
  if (intent.kind === 'move') {
    if (intent.tile !== u.tile && canEnter(combatOf(next), u, intent.tile))
      next = stepTo(next, draw, id, intent.tile, false, false, content)
    return [next, rally]
  }
  let moved = false
  const steps = intent.kind === 'charge' ? 2 : 1
  for (let k = 0; k < steps && u.tile !== intent.from; k++) {
    const to = u.tile + Math.sign(intent.from - u.tile)
    if (!canEnter(combatOf(next), u, to)) break
    next = stepTo(next, draw, id, to, false, false, content)
    moved = true
    u = unit(next, id)
    if (!standing(u)) return [next, rally]
  }
  if (intent.kind === 'rally') return [log(next, `${u.name} rallies the others.`, 'bad'), true]
  // Discorded and unable to fall back: it turns on one of its own.
  if (infighting(combatOf(next), u, intent)) {
    const victim = infightTarget(combatOf(next), u)
    if (!victim) return [log(next, `${u.name} mills about, lost in the din.`, 'good'), rally]
    const spec = attackSpec(combatOf(next), u, victim, { discord: true })
    return [strike(next, draw, spec, false, content), rally]
  }
  if (!intentLands(combatOf(next), u, intent)) {
    next = log(next, `${u.name}'s blow at tile ${intent.tile + 1} finds no one.`, 'good')
    const to = moved ? u.tile : repositionTile(combatOf(next), u, content)
    if (to !== u.tile) next = stepTo(next, draw, id, to, false, false, content)
    return [next, rally]
  }
  for (const target of intentTargets(combatOf(next), intent)) {
    const a = unit(next, id)
    const t = unit(next, target.id)
    if (!standing(a) || !standing(t)) continue
    const spec = attackSpec(combatOf(next), a, t, { volley: intent.kind === 'volley', rally })
    next = strike(next, draw, spec, false, content)
  }
  // Hit and run: a step back toward its own end, without free swings.
  u = unit(next, id)
  if (intent.kind === 'hitAndRun' && standing(u)) {
    const back = u.tile + Math.sign(u.tile - intent.tile)
    if (back !== u.tile && canEnter(combatOf(next), u, back))
      next = setUnit(next, { ...u, tile: back })
  }
  return [next, rally]
}

/** Every standing enemy acts, in action order as they stand when the turn starts. */
function enemyTurn(s: GameState, draw: Draw, content: Content): GameState {
  let next = s
  let rally = false
  for (const { id } of actionOrder(combatOf(next))) {
    if (combatOf(next).result !== null || combatOf(next).morale === 'broke') break
    if (sideUnits(combatOf(next), 'party').length === 0) break
    const u = unit(next, id)
    if (!standing(u)) continue
    if (isStunned(u)) {
      next = log(next, `${u.name} is stunned and loses its turn.`, 'good')
      continue
    }
    const intent = u.intent ?? { kind: 'move', from: u.tile, tile: u.tile, twice: false }
    for (let k = 0; k < (intent.twice ? 2 : 1); k++) {
      if (!standing(unit(next, id))) break
      ;[next, rally] = enemyAct(next, draw, id, intent, rally, content)
    }
  }
  return next
}

/** A new round: members ready again, enemy hit counts and staggers cleared, new intents. */
function newRound(s: GameState, draw: Draw, content: Content): GameState {
  const combat = combatOf(s)
  const round = combat.round + 1
  // Lasting effects past their last round fall away.
  const units = combat.units.map((u) => {
    const effects = u.effects.filter((e) => e.until >= round)
    return u.side === 'party'
      ? { ...u, moved: false, acted: false, effects }
      : { ...u, hits: 0, staggered: false, effects }
  })
  const fresh = { ...combat, round, units }
  return setCombat(s, planIntents(draw, fresh, content))
}

// ---------------------------------------------------------------------------------------------
// The end of a fight
// ---------------------------------------------------------------------------------------------

/** How the fight stands: decided (a result) or not (null). */
export function outcome(combat: CombatState): CombatResult | null {
  if (combat.result !== null) return combat.result
  if (sideUnits(combat, 'enemy').length === 0) return combat.morale === 'broke' ? 'rout' : 'victory'
  if (sideUnits(combat, 'party').length > 0) return null
  return combat.units.some((u) => u.side === 'party' && u.status === 'left') ? 'retreat' : 'wipe'
}

const END_LINES: Record<CombatResult, [string, LogTone]> = {
  victory: ['The fight is won.', 'good'],
  rout: ['The enemy breaks and runs. The fight is won.', 'good'],
  retreat: ['The party falls back and gets away.', 'bad'],
  wipe: ['The last of the party goes down.', 'crit'],
}

/**
 * The ending's effects: the retreat's camaraderie and the encounter's branch. A wipe waits for the
 * player's choice (`combatWipeChoice`), which applies its cost and the `lose` branch.
 */
function finish(s: GameState, result: CombatResult, content: Content): GameState {
  const [text, tone] = END_LINES[result]
  let next = log(setCombat(s, { ...combatOf(s), result }), text, tone)
  next = appendLog(next, text, tone)
  if (result === 'wipe') return next
  if (result === 'retreat') {
    const cost = setbackCamaraderie(
      livingMembers(next).length,
      { wonder: false },
      { tags: ['retreat'] },
      null
    )
    next = changeCamaraderie(next, cost, 'they fled a fight')
  }
  const fight = combatOf(next).fight
  const branch = result === 'retreat' ? fight?.flee : fight?.win
  if (branch) next = resolveFightBranch(next, branch, tone, content)
  return next
}

/** A wipe waiting for the player's choice of how the party gets out of it. */
export const wipePending = (state: Pick<GameState, 'combat'>): boolean =>
  state.combat?.result === 'wipe'

/**
 * A wipe's choice (combat design §7, combat/defeat.ts wipeOptions): its cost, CAMARADERIE_WIPE,
 * the living come to with 1 HP, the encounter's `lose` branch, and the fight is closed.
 */
function chooseAfterWipe(
  s: GameState,
  draw: Draw,
  action: Extract<CombatAction, { type: 'combatWipeChoice' }>,
  content: Content
): GameState {
  const options = wipeOptions(s)
  const name = (id: string) => s.party.find((c) => c.id === id)?.name ?? id
  let next = s
  if (action.choice === 'surrender') {
    const { gold, kept, goods } = options.surrender
    const left = { ...s.goods }
    for (const [g, n] of Object.entries(goods) as [Good, number][]) left[g] = (left[g] ?? 0) - n
    next = { ...next, gold: s.gold - gold, goods: left }
    const hidden = kept > 0 ? ` (${kept} gp stay hidden in the compartment)` : ''
    next = appendLog(
      next,
      `They surrender: ${gold} gp and half of every good but essentials are taken${hidden}.`,
      'bad'
    )
  } else if (action.choice === 'struggle') {
    // The same draws the preview peeked at: the first of this step's RNG.
    const injuries = rollStruggle(draw, livingOf(s.party))
    for (const { member, ability } of injuries) {
      next = {
        ...next,
        party: next.party.map((c) =>
          c.id === member ? applyDefeat(c, { kind: 'injury', ability }) : c
        ),
      }
      next = appendLog(
        next,
        `${name(member)} struggles free with a lasting wound (−2 ${statLabel(ability)}).`,
        'bad'
      )
    }
  } else {
    const member = action.member
    if (!member || !options.sacrifice?.members.includes(member)) return s
    next = {
      ...next,
      party: next.party.map((c) => (c.id === member ? applyDefeat(c, { kind: 'death' }) : c)),
    }
    next = appendLog(
      next,
      `${name(member)} stays behind so the others can get away, and dies; their gear is lost with them.`,
      'crit'
    )
  }
  next = changeCamaraderie(next, -CAMARADERIE_WIPE, 'the party was beaten')
  next = {
    ...next,
    party: next.party.map((c) =>
      c.exhaustion < MAX_EXHAUSTION && c.hp <= 0 ? { ...c, hp: 1 } : c
    ),
  }
  const branch = combatOf(s).fight?.lose
  if (branch) next = resolveFightBranch(next, branch, 'bad', content)
  return { ...next, combat: null }
}

/** Ends the fight when it is decided. */
function settle(s: GameState, content: Content): GameState {
  if (!s.combat || s.combat.result !== null) return s
  const result = outcome(s.combat)
  return result ? finish(s, result, content) : s
}

// ---------------------------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------------------------

export function stepCombat(state: GameState, action: CombatAction, content: Content): GameState {
  if (action.type === 'startCombat') {
    const open = state.encounter?.stage != null ? state.encounter : null
    const fight = action.fight ?? open?.situation.fight
    if (!fight || state.combat !== null) return state
    return startCombat(state, content, fight, { footing: open?.position ?? 'normal' })
  }
  if (action.type === 'closeCombat')
    return state.combat && state.combat.result !== null && !wipePending(state)
      ? { ...state, combat: null }
      : state
  if (action.type === 'combatWipeChoice') {
    if (!wipePending(state)) return state
    const [next, rng] = withRng(state.rng, (draw) => chooseAfterWipe(state, draw, action, content))
    return next === state ? state : { ...next, rng }
  }
  if (!fighting(state)) return state
  const [next, rng] = withRng(state.rng, (draw) => {
    switch (action.type) {
      case 'combatMove':
        return move(state, draw, action, content)
      case 'combatAct':
        return act(state, draw, action, content)
      case 'combatRetreat':
        return retreat(state, draw, action.unit, content)
      case 'combatAbility':
        return useAbility(state, draw, action, content, {
          log,
          setUnit,
          syncHp,
          strike: (s, d, spec) => strike(s, d, spec, true, content),
        })
      case 'combatEndTurn': {
        // A fight decided by the enemies' turn ends there, without a new round.
        const s = settle(state, content)
        if (!fighting(s)) return s
        const skip = combatOf(s).round === 1 && combatOf(s).surprise === 'party'
        const after = skip ? s : enemyTurn(s, draw, content)
        const settled = settle(after, content)
        return fighting(settled) ? newRound(settled, draw, content) : settled
      }
    }
  })
  return settle({ ...next, rng }, content)
}
