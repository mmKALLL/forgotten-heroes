import { emptyContent, type Content } from '../../content/build'
import type { LogTone } from '../../schema/types'
import type { Condition, Effect } from '../../schema/encounter'
import type { Character, EncounterState, GameState } from '../../schema/state'
import { capitalFirst, formatModifier } from '../format'
import { appendLog } from '../log'
import { withRng, type Rng } from '../rng'
import { statLabel } from '../rules/abilities'
import { MAX_EXHAUSTION, canAct, statModifier } from '../rules/character'
import { passDay } from '../travel/days'
import { addReputation, encounterSettlement } from '../town/reputation'
import { terrainHere } from '../world/graph'
import { domainAt, poisToDiscover } from '../world/pois'
import { crisisHidden } from '../crisis/sites'
import { crisisClue, learnPlan, revealKeySite, thwartAct } from '../crisis/progress'
import { actNumeral } from '../crisis/text'
import { changeGoods } from '../economy/goods'
import { changeAnimals } from '../town/animals'
import { siteContractsMet } from '../town/contract-hooks'
import { siteStatus } from '../world/sites'
import { gainXp, xpLine } from '../rules/progression'
import { DOWNED_EXHAUSTION, LAIR_XP_SHARE, XP_CLEAR, XP_DISCOVER } from '../constants'
import { crLevel } from '../rules/challenge'
import { levelGap } from '../rules/levels'
import { siteCr } from '../world/dungeons'
import { shiftCamaraderie } from '../town/camaraderie'
import { describeAccessory, lootAccessory } from '../gear/accessories'
import { describeHoard, payHoard, payMilestone } from '../world/hoard'

export { MAX_EXHAUSTION }

/**
 * Who "actor" means for this batch of effects: the member who rolled (fixed options have none),
 * and the content, which clues (discoverPoi) need to find their sites.
 */
export type EffectContext = { actorId?: string; content?: Content }

/** Logged when a clue (discoverPoi) has nothing left to reveal. */
export const NOTHING_TO_LEARN = 'There is nothing new to learn about the land around here.'

/** A line in the journal, and in the encounter's own log when one is open. */
export function note(state: GameState, text: string, tone: LogTone): GameState {
  const next = appendLog(state, text, tone)
  if (!next.encounter) return next
  return { ...next, encounter: { ...next.encounter, log: [...next.encounter.log, { text, tone }] } }
}

/** XP gained, with a line in the journal (and the encounter's log when one is open). */
export const xpNote = (state: GameState, amount: number, why: string): GameState =>
  amount > 0 ? note(gainXp(state, amount), xpLine(amount, why), 'good') : state

/**
 * Marks POIs discovered, with a journal line for each, and XP_DISCOVER XP for each site (however
 * it was found: exploring, rumours, clues or a contract).
 */
export function revealPois(state: GameState, content: Content, ids: readonly string[]): GameState {
  let next = state
  for (const id of ids) {
    const poi = next.world.pois[id]
    next = {
      ...next,
      world: { ...next.world, pois: { ...next.world.pois, [id]: { ...poi, discovered: true } } },
    }
    const type = Object.hasOwn(content.poiTypes, poi.type) ? content.poiTypes[poi.type] : null
    next = note(
      next,
      `You learn of ${poi.name}${type ? ` (${type.name.toLowerCase()})` : ''}.`,
      'good'
    )
  }
  const names = ids.map((id) => next.world.pois[id].name)
  const why = names.length === 1 ? `${names[0]} found` : `${names.length} sites found`
  return xpNote(next, XP_DISCOVER * ids.length, why)
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function targetIds(
  state: GameState,
  target: 'actor' | 'all' | 'random',
  ctx: EffectContext
): [string[], Rng] {
  if (target === 'all') return [state.party.map((c) => c.id), state.rng]
  if (target === 'actor' && state.party.some((c) => c.id === ctx.actorId))
    return [[ctx.actorId!], state.rng]
  // "random", or "actor" with no actor (the content validator forbids that in fixed options).
  const able = state.party.filter(canAct)
  if (able.length === 0) return [[], state.rng]
  const [id, rng] = withRng(state.rng, (d) => d.pick(able).id)
  return [[id], rng]
}

/** Whether a condition holds in this encounter (no encounter: nothing has been revealed). */
export function conditionHolds(condition: Condition, encounter: EncounterState | null): boolean {
  switch (condition.cond) {
    case 'twistRevealed':
      return (encounter?.twistRevealed ?? false) !== (condition.not ?? false)
  }
}

/** The twist's opening hit: the drawn kind's (merged into the snapshot) or the bespoke twist's. */
export const openingEffects = (encounter: EncounterState | null): Effect[] =>
  encounter?.situation.twist?.opening ?? []

/**
 * The effects an outcome really applies: those whose condition fails are dropped, conditions are
 * stripped, and `openingHit` becomes the twist's opening effects. Conditions are checked once,
 * against the encounter as the outcome starts to apply.
 */
export function prepareEffects(
  effects: readonly Effect[],
  encounter: EncounterState | null
): Effect[] {
  return effects.flatMap((effect): Effect[] => {
    if (effect.if && !conditionHolds(effect.if, encounter)) return []
    const { if: _if, ...plain } = effect
    if (plain.effect === 'openingHit')
      return prepareEffects(
        openingEffects(encounter).filter((e) => e.effect !== 'openingHit'),
        encounter
      )
    return [plain as Effect]
  })
}

function applyEffect(state: GameState, effect: Effect, ctx: EffectContext): GameState {
  switch (effect.effect) {
    case 'gold':
      return { ...state, gold: Math.max(0, state.gold + effect.amount) }
    case 'hp': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const downed: string[] = []
      const party = state.party.map((c) => {
        if (!ids.includes(c.id)) return c
        const hp = clamp(c.hp + effect.amount, 0, c.maxHp)
        // A wound that drops a living member to 0 HP, or lands on one already down, leaves
        // DOWNED_EXHAUSTION levels of exhaustion (Plan 6 B): pressing on hurt can kill (exhaustion
        // 6 is death). downedChips foresees it for the previews.
        if (effect.amount >= 0 || hp > 0 || c.exhaustion >= MAX_EXHAUSTION) return { ...c, hp }
        downed.push(c.name)
        return { ...c, hp, exhaustion: clamp(c.exhaustion + DOWNED_EXHAUSTION, 0, MAX_EXHAUSTION) }
      })
      const next = { ...state, rng, party }
      return downed.reduce(
        (s, name) =>
          note(s, `${name} goes down, badly hurt: +${DOWNED_EXHAUSTION} exhaustion.`, 'bad'),
        next as GameState
      )
    }
    case 'healFraction': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const party = state.party.map((c) =>
        ids.includes(c.id) ? { ...c, hp: Math.min(c.maxHp, c.hp + healOf(c, effect.fraction)) } : c
      )
      return { ...state, rng, party }
    }
    case 'exhaustion': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const party = state.party.map((c) =>
        ids.includes(c.id)
          ? { ...c, exhaustion: clamp(c.exhaustion + effect.amount, 0, MAX_EXHAUSTION) }
          : c
      )
      return { ...state, rng, party }
    }
    case 'inspiration':
      return { ...state, inspiration: Math.max(0, state.inspiration + effect.amount) }
    case 'days': {
      // Time passes as on any day: everyone eats and drinks (or goes without), strain fades.
      const terrain = ctx.content ? terrainHere(state, ctx.content) : null
      let next = state
      for (let day = 0; day < effect.amount; day++)
        next = passDay(next, terrain, undefined, ctx.content)
      return next
    }
    case 'position':
      return state.encounter
        ? { ...state, encounter: { ...state.encounter, position: effect.position } }
        : state
    case 'followUp':
      return {
        ...state,
        followUps: [
          ...state.followUps,
          { situationId: effect.situation, wait: effect.after, queuedDay: state.day },
        ],
      }
    case 'nextCheckModifier':
      if (!state.encounter) return state
      return {
        ...state,
        encounter: {
          ...state.encounter,
          nextCheckModifier: state.encounter.nextCheckModifier + effect.amount,
          nextCheckReason: effect.reason ?? state.encounter.nextCheckReason,
        },
      }
    case 'revealTwist':
      if (!state.encounter) return state
      return {
        ...state,
        encounter: {
          ...state.encounter,
          twistRevealed: true,
          twistKindRevealed: state.encounter.twistKindRevealed || (effect.kind ?? false),
        },
      }
    case 'openingHit':
      // prepareEffects expands it; reaching here means there was nothing to expand.
      return state
    case 'log':
      return note(state, effect.text, effect.tone)
    case 'discoverPoi': {
      const domain = state.encounter?.domain ?? domainAt(state.world, state.location)
      const hidden = crisisHidden(state)
      const ids = ctx.content
        ? poisToDiscover(state.world, ctx.content, domain, effect, hidden)
        : []
      if (ids.length === 0) return note(state, NOTHING_TO_LEARN, 'info')
      return revealPois(state, ctx.content!, ids)
    }
    case 'clearPoi': {
      const id = state.encounter?.poi
      if (!id || !Object.hasOwn(state.world.pois, id)) return state
      const poi = state.world.pois[id]
      // A lair (any cycling site with a CR) pays LAIR_XP_SHARE of what its CR's level needs to
      // level up (Plan 6 B), a site without one XP_CLEAR; a site grown stronger pays more, × (1 +
      // power), the power before clearing.
      const power = siteStatus(state.world.seed, id, poi, state.day)?.power ?? 0
      const cr = ctx.content ? siteCr(state.world, ctx.content, id, state.day) : null
      const xp =
        (1 + power) * (cr === null ? XP_CLEAR : Math.round(LAIR_XP_SHARE * levelGap(crLevel(cr))))
      const pois = { ...state.world.pois, [id]: { ...poi, clearedDay: state.day } }
      const cleared = { ...state, world: { ...state.world, pois } }
      const told = note(
        cleared,
        `${capitalFirst(poi.name)} is cleared. It will lie empty for a while.`,
        'good'
      )
      const paid = xpNote(told, xp, `${poi.name} cleared`)
      return siteContractsMet(paid, 'bounty', id)
    }
    case 'trainSkill': {
      const untrained = state.party
        .map((c, order) => ({ c, order, modifier: statModifier(c, effect.skill) }))
        .filter(({ c }) => !c.skillProficiencies.includes(effect.skill))
        .sort((a, b) => b.modifier - a.modifier || a.order - b.order)
      if (untrained.length === 0) return state
      const pupil = untrained[0].c
      const party = state.party.map((c) =>
        c.id === pupil.id
          ? { ...c, skillProficiencies: [...c.skillProficiencies, effect.skill] }
          : c
      )
      return note(
        { ...state, party },
        `${pupil.name} is now trained in ${statLabel(effect.skill)}.`,
        'good'
      )
    }
    case 'goods':
      // Without content every good is worth the same, so a category is taken in design order.
      return { ...state, goods: changeGoods(state.goods, ctx.content ?? emptyContent(), effect) }
    case 'animals':
      return changeAnimals(state, ctx.content ?? emptyContent(), effect)
    case 'reputation':
      return addReputation(state, { settlement: encounterSettlement(state), amount: effect.amount })
    case 'xp':
      // Silent: the outcome's chips already say "+N XP" (run.ts resolve).
      return gainXp(state, effect.amount)
    case 'camaraderie': {
      const { value, line } = shiftCamaraderie(state.camaraderie, effect.amount)
      const next = { ...state, camaraderie: value }
      return line ? note(next, line.text, line.tone) : next
    }
    case 'accessory': {
      // Loot: one rolled into the party's gear (gear/accessories.ts). Without content, nothing.
      const looted = ctx.content ? lootAccessory(state, ctx.content, effect.tier) : null
      if (!looted) return state
      return note(looted.state, `Found: ${describeAccessory(looted.accessory)}.`, 'good')
    }
    // The Crisis (Plan 5b, crisis/progress.ts). Without content they do nothing.
    case 'learnPlan':
      return ctx.content ? learnPlan(state, ctx.content) : state
    case 'revealKeySite':
      return ctx.content ? revealKeySite(state, ctx.content) : state
    case 'crisisClue':
      return ctx.content ? crisisClue(state, ctx.content, effect.amount) : state
    case 'thwartAct':
      return ctx.content ? thwartAct(state, ctx.content) : state
    // Delving (Plan 6 D3, world/delve.ts): the room's end, written into its snapshot.
    case 'driveOut':
      return state.delve ? { ...state, delve: { ...state.delve, ended: 'driven' } } : state
    case 'hoard':
      return payHoard(state, ctx.content, effect)
    case 'milestone':
      return payMilestone(state, effect)
    // Plan 7: the step opens the stage's Fight after the outcome (combat/offer.ts).
    case 'fight':
      return state
  }
}

/**
 * Pure: applies effects in order (after prepareEffects, so conditions are checked against the
 * state as it was before the first). Random targets draw from the state's RNG.
 */
export function applyEffects(
  state: GameState,
  effects: readonly Effect[],
  ctx: EffectContext = {}
): GameState {
  return prepareEffects(effects, state.encounter).reduce(
    (current, effect) => applyEffect(current, effect, ctx),
    state
  )
}

const WHO = { all: 'everyone', random: 'someone' } as const

/**
 * Who these effects (prepared: prepareEffects) would put down, as chips after the effect chips:
 * "Bram goes down: +2 exhaustion" for a wound that drops a member to 0 HP or lands on one already
 * down, as applyEffect's hp does, following HP through the effects in order. A random target (or
 * "actor" with no actor) can't be named: "a member at 0 HP gains +2 exhaustion" when the wound
 * could drop someone able to act.
 */
export function downedChips(
  party: readonly Character[],
  effects: readonly Effect[],
  actorId: string | undefined
): string[] {
  let members = [...party]
  const chips: string[] = []
  const named = (target: 'actor' | 'all' | 'random'): string[] | null => {
    if (target === 'all') return members.map((c) => c.id)
    if (target === 'actor' && members.some((c) => c.id === actorId)) return [actorId!]
    return null
  }
  for (const effect of effects) {
    if (effect.effect === 'hp') {
      const ids = named(effect.target)
      if (ids === null) {
        const could = members.some((c) => canAct(c) && c.hp + effect.amount <= 0)
        if (effect.amount < 0 && could)
          chips.push(`a member at 0 HP gains +${DOWNED_EXHAUSTION} exhaustion`)
        continue
      }
      const down: string[] = []
      members = members.map((c) => {
        if (!ids.includes(c.id)) return c
        const hp = clamp(c.hp + effect.amount, 0, c.maxHp)
        if (effect.amount >= 0 || hp > 0 || c.exhaustion >= MAX_EXHAUSTION) return { ...c, hp }
        down.push(c.name)
        return { ...c, hp, exhaustion: clamp(c.exhaustion + DOWNED_EXHAUSTION, 0, MAX_EXHAUSTION) }
      })
      if (down.length > 0)
        chips.push(
          `${down.join(' and ')} ${down.length > 1 ? 'go' : 'goes'} down: +${DOWNED_EXHAUSTION} exhaustion${down.length > 1 ? ' each' : ''}`
        )
    } else if (effect.effect === 'healFraction' || effect.effect === 'exhaustion') {
      const ids = named(effect.target)
      if (ids === null) continue
      members = members.map((c) => {
        if (!ids.includes(c.id)) return c
        return effect.effect === 'healFraction'
          ? { ...c, hp: Math.min(c.maxHp, c.hp + healOf(c, effect.fraction)) }
          : { ...c, exhaustion: clamp(c.exhaustion + effect.amount, 0, MAX_EXHAUSTION) }
      })
    }
  }
  return chips
}

/** What a healFraction heals a character: the share of their max HP, rounded up. */
export const healOf = (c: Pick<Character, 'maxHp'>, fraction: number): number =>
  Math.ceil(c.maxHp * fraction)

/** How a condition reads after an effect chip in a preview, e.g. "Edge (if you know the odds)". */
export function describeCondition(condition: Condition): string {
  switch (condition.cond) {
    case 'twistRevealed':
      return condition.not ? 'unless you know the odds' : 'if you know the odds'
  }
}

/**
 * A short chip for previews and the journal, e.g. "Lyra −3 HP". Log effects return null. The
 * condition is not included (see describeCondition).
 */
export function describeEffect(
  effect: Effect,
  actorName: string,
  /** The settlement a reputation effect changes, named in its chip. */
  place?: string,
  /** The Crisis's current act (1–3), named in clue and thwart chips; null when none. */
  act: number | null = null
): string | null {
  switch (effect.effect) {
    case 'gold':
      return `${formatModifier(effect.amount)} gp`
    case 'hp':
      return `${effect.target === 'actor' ? actorName : WHO[effect.target]} ${formatModifier(effect.amount)} HP`
    case 'healFraction':
      return `${effect.target === 'actor' ? actorName : WHO[effect.target]} +${Math.round(effect.fraction * 100)}% max HP`
    case 'exhaustion':
      return `${effect.target === 'actor' ? actorName : WHO.all} ${formatModifier(effect.amount)} exhaustion`
    case 'inspiration':
      return `${formatModifier(effect.amount)} inspiration`
    case 'days':
      return effect.amount === 1 ? '1 day passes' : `${effect.amount} days pass`
    case 'position':
      return { edge: 'Edge', exposed: 'Exposed', normal: 'normal position' }[effect.position]
    case 'followUp':
      return 'consequences later'
    case 'nextCheckModifier':
      return `${formatModifier(effect.amount)} to the next check`
    case 'revealTwist':
      return effect.kind
        ? 'reveals what the twist is, and how likely'
        : 'reveals how likely the twist is'
    case 'openingHit':
      return 'an opening hit'
    case 'log':
      return null
    case 'discoverPoi': {
      const what =
        effect.count === 1
          ? `a ${effect.category ?? 'site'}`
          : `${effect.count} ${effect.category ?? 'site'}s`
      return `reveals ${what} ${effect.scope === 'land' ? 'in the land' : 'nearby'}`
    }
    case 'clearPoi':
      return 'clears the site'
    case 'trainSkill':
      return `someone learns ${statLabel(effect.skill)}`
    case 'goods': {
      const what = effect.good ?? `${effect.category} goods`
      if (effect.fraction === undefined) return `${formatModifier(effect.amount ?? 0)} ${what}`
      const share =
        effect.fraction === 1
          ? 'all'
          : effect.fraction === 0.5
            ? 'half'
            : `${Math.round(effect.fraction * 100)}% of`
      return `lose ${share} your ${what}`
    }
    case 'reputation':
      return `${formatModifier(effect.amount)} reputation${place ? ` in ${place}` : ''}`
    case 'animals':
      return `${formatModifier(effect.amount)} ${effect.animal ?? 'animal'}`
    case 'xp':
      // An xp effect of 0 only stops the roll's default XP: it has no chip.
      return effect.amount > 0 ? `+${effect.amount} XP` : null
    case 'camaraderie':
      return `${formatModifier(effect.amount)} camaraderie`
    case 'accessory':
      return effect.tier === 1 ? 'an accessory' : 'a fine accessory'
    case 'learnPlan':
      return 'Learn the plan'
    case 'revealKeySite':
      return act === null ? 'Find the key site' : `Find Act ${actNumeral(act - 1)}'s key site`
    case 'crisisClue':
      return act === null
        ? `+${effect.amount} clue`
        : `+${effect.amount} clue: Act ${actNumeral(act - 1)}`
    case 'thwartAct':
      return act === null ? 'Thwart the act' : `Thwart Act ${actNumeral(act - 1)}`
    case 'driveOut':
      return 'driven out: the delve ends'
    case 'hoard':
      return describeHoard(effect)
    case 'milestone':
      return `+${effect.xp} XP: a milestone (once a clearing)`
    case 'fight':
      return 'the fight starts: they strike first'
  }
}
