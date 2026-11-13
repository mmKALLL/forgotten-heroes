import type { Content } from '../../content/build'
import type { Climax } from '../../schema/common'
import type {
  CheckOption,
  Effect,
  FightEnemy,
  FightOption,
  Option,
  Outcome,
  OutcomeBranch,
  Situation,
  Stage,
  TwistKind,
} from '../../schema/encounter'
import type { Character } from '../../schema/state'
import type { Skill } from '../../schema/types'
import { rankActors } from '../rules/character'
import { crDc, crLevel } from '../rules/challenge'
import { typicalPay } from '../rules/levels'
import { isAlive } from '../town/camaraderie'
import { groupCr, henchmenCount, roadFightCount, type FightDifficulty } from '../combat/budget'
import {
  CLIMAX_FIGHT_DIFFICULTY,
  CRISIS_DC_BASE,
  PARLEY_TOLL_MIN,
  PARLEY_TOLL_SHARE,
  ROAD_FIGHT_DIFFICULTY,
  SITE_FIGHT_DIFFICULTY,
} from '../constants'
import { TWIST_STAGE_PREFIX } from './compile'
import { defaultXp } from './outcomes'

// Fight and Parley in encounters (Plan 7 Track I; combat design §1). When an encounter starts, its
// snapshot gains engine-made options (before it is hardened, so the danger ramp, a site's CR and a
// room's rules apply to them as to every other option):
// - Fight on the line, beside a hostile stage's fight-like check (`check.combat`) when its foes are
//   known (the situation's `foe`, else its first creature slot), on the road and at hostile sites;
//   and beside a climax's skill challenge (a dungeon's last room, a Crisis key), against its boss.
//   Win: the check's success (or the challenge's win); retreat: the stage's flight; a wipe: the
//   check's failure (or the challenge's loss), after the wipe's choice. The fight did the hurting,
//   so written wounds are dropped from the retreat and the loss.
// - Parley, beside every Fight but a climax's: the party's best of Persuasion, Deception and
//   Intimidation against crDc of the group's CR. Success lets the party pass; a partial pays a
//   toll; a failure is refused (the other options stay); a critical failure starts the fight with
//   the enemies striking first.
// Killing pays no XP: a Fight won pays what the check's success would (its default XP for the DC).

/** The engine-made options' ids (reserved: content may not use them). */
export const FIGHT_OPTION = 'line-fight'
export const PARLEY_OPTION = 'line-parley'
/** The skills a Parley may use: the party's best of them. */
export const PARLEY_SKILLS: readonly Skill[] = ['persuasion', 'deception', 'intimidation']

/** How the encounter's Fights are built (startEncounter). */
export type FightSetup =
  /** On the road: a group for the party's own levels. */
  | { kind: 'road' }
  /** At a hostile site of this CR: a group for a party of the site's level. */
  | { kind: 'site'; cr: number }
  /** A climax at this CR: its boss and henchmen, on its challenge stages only. */
  | { kind: 'climax'; cr: number; climax: Climax }
  /** None (a dungeon's other rooms, a Crisis lead). */
  | { kind: 'none' }

export type FightContext = {
  setup: FightSetup
  content: Content
  party: readonly Character[]
  /** The creatures the encounter's creature slots drew, by slot name. */
  creatures: Readonly<Record<string, string>>
  /** The twist kind joined from the table, if any (its stages are `twist-…`). */
  kind: TwistKind | null
}

/** A CR as players read it: 1/8, 1/4, 1/2, else whole. */
export function formatCr(cr: number): string {
  if (cr > 0 && cr < 1) return `1/${Math.round(1 / cr)}`
  return String(cr)
}

/** What a group reads as on the Fight option: "Bandit ×4 (CR 1/8)". */
export function describeFoes(content: Content, enemies: readonly FightEnemy[]): string {
  return enemies
    .map((e) => {
      const c = content.creatures[e.creature]
      const name = c ? c.name[0].toUpperCase() + c.name.slice(1) : e.creature
      const cr = c ? `CR ${formatCr(c.cr)}` : 'CR unknown'
      return `${name}${e.count > 1 ? ` ×${e.count}` : ''} (${e.boss ? 'boss, ' : ''}${cr})`
    })
    .join(', ')
}

/** The members who would stand on the line. */
const fighters = (party: readonly Character[]) => party.filter((c) => isAlive(c) && c.hp > 0)

/** A branch's text and effects that name no actor: a fight's ending has none. */
const ACTORLESS: Record<'win' | 'flee' | 'lose', string> = {
  win: 'The fight is yours.',
  flee: 'You get away.',
  lose: 'You come to, beaten and alone on the ground.',
}

/**
 * A check's branch as a fight's ending: its written wounds dropped (the fight did the hurting),
 * and with no actor, so effects on the actor go and a text naming {actor} becomes a plain line.
 */
const unhurt = (b: OutcomeBranch, end: 'win' | 'flee' | 'lose'): OutcomeBranch => ({
  ...b,
  text: /\{actor\}/i.test(b.text) ? ACTORLESS[end] : b.text,
  effects: b.effects.filter(
    (e) => !(e.effect === 'hp' && e.amount < 0) && !('target' in e && e.target === 'actor')
  ),
})

/** An outcome as a plain branch (its twist branch dropped). */
const plain = ({ twist: _twist, ...branch }: Outcome): OutcomeBranch => branch

/** A branch that ends the encounter (no goto, no stay). */
const ending = ({ goto: _goto, stay: _stay, ...branch }: OutcomeBranch): OutcomeBranch => branch

const DEFAULT_FLEE: OutcomeBranch = { text: 'You break off and get away.', effects: [] }

/** A stage's flight: its retreat option's outcome (a check's success), unhurt; else a plain getaway. */
function fleeOf(stage: Stage): OutcomeBranch {
  const retreat = stage.options.find((o) => o.tags?.includes('retreat'))
  if (retreat?.kind === 'fixed') return unhurt(plain(retreat.outcome), 'flee')
  if (retreat?.kind === 'check') return unhurt(plain(retreat.outcomes.success), 'flee')
  return DEFAULT_FLEE
}

/** The stage's fight-like check: the first check marked `combat`. */
const combatCheck = (stage: Stage): CheckOption | undefined =>
  stage.options.find((o): o is CheckOption => o.kind === 'check' && o.check.combat === true)

/** The creature a stage's Fight is against, or null when it can't be told. */
function foeOf(situation: Situation, stageId: string, ctx: FightContext): string | null {
  const twisted = stageId.startsWith(TWIST_STAGE_PREFIX)
  const known = (id: string | undefined) =>
    id !== undefined && Object.hasOwn(ctx.content.creatures, id) ? id : null
  const firstSlot = (slots: Record<string, unknown>) =>
    Object.keys(slots)
      .sort()
      .map((name) => ctx.creatures[name])
      .find((id) => id !== undefined)
  if (twisted) {
    const kind = ctx.kind
    return kind ? known(kind.foe ?? firstSlot(kind.slots)) : null
  }
  return known(situation.foe ?? firstSlot(situation.slots))
}

/** A stage's fights are for hostile scenes: the situation, or for a twist's stage the twist kind. */
function hostile(situation: Situation, stageId: string, kind: TwistKind | null): boolean {
  if (stageId.startsWith(TWIST_STAGE_PREFIX)) return kind?.disposition === 'hostile'
  return situation.disposition === 'hostile'
}

/** The party's best Parley skill now (ties: Persuasion, Deception, Intimidation). */
export function parleySkill(party: readonly Character[]): Skill {
  let best: { skill: Skill; modifier: number } | null = null
  for (const skill of PARLEY_SKILLS) {
    const top = rankActors(party, skill)[0]
    if (top && (best === null || top.modifier > best.modifier))
      best = { skill, modifier: top.modifier }
  }
  return best?.skill ?? PARLEY_SKILLS[0]
}

/** A Fight option on a stage. */
function fightOption(
  content: Content,
  enemies: FightEnemy[],
  ambush: boolean,
  win: OutcomeBranch,
  flee: OutcomeBranch,
  lose: OutcomeBranch
): FightOption {
  const foes = describeFoes(content, enemies)
  return {
    id: FIGHT_OPTION,
    kind: 'fight',
    label: 'Fight on the line',
    description: ambush ? `${foes}. An ambush: more may be lying in wait.` : `${foes}.`,
    requires: [],
    once: true,
    fight: { enemies, ambush, win, flee, lose },
  }
}

/** A Parley option against a group: its written DC (before hardening) and the toll's gold. */
function parleyOption(skill: Skill, dc: number, toll: number): CheckOption {
  const fight: Effect = { effect: 'fight' }
  return {
    id: PARLEY_OPTION,
    kind: 'check',
    label: 'Parley',
    description: 'Talk them into letting you pass, or buy your way by.',
    requires: [],
    once: true,
    check: { skill, dc },
    outcomes: {
      critFail: {
        text: 'The talk turns ugly, and they go for their weapons before you do.',
        effects: [fight],
        stay: true,
      },
      fail: { text: 'They will hear none of it.', effects: [], stay: true },
      partial: {
        text: 'They let you pass, for a price.',
        effects: [{ effect: 'gold', amount: -toll }],
      },
      success: { text: '{actor} talks them round, and they let you pass.', effects: [] },
    },
  }
}

/** The levels a group is budgeted for: the party's own (the road), else a party of the CR's level. */
const budgetLevels = (party: readonly Character[], cr: number | null): number[] => {
  const members = fighters(party)
  const size = Math.max(1, members.length)
  return cr === null ? members.map((c) => c.level) : Array.from({ length: size }, () => crLevel(cr))
}

/** A road or site stage's Fight and Parley, or nothing. */
function stageFights(
  situation: Situation,
  stageId: string,
  stage: Stage,
  ctx: FightContext,
  site: number | null
): Option[] {
  const check = combatCheck(stage)
  if (!check || !hostile(situation, stageId, ctx.kind)) return []
  const foe = foeOf(situation, stageId, ctx)
  if (foe === null) return []
  const twisted = stageId.startsWith(TWIST_STAGE_PREFIX)
  const ambush = twisted ? ctx.kind?.id === 'ambush' : situation.tags.includes('ambush')
  const difficulty: FightDifficulty =
    site !== null ? SITE_FIGHT_DIFFICULTY : ambush || twisted ? 'hard' : ROAD_FIGHT_DIFFICULTY
  const levels = budgetLevels(ctx.party, site)
  if (levels.length === 0) return []
  const cr = ctx.content.creatures[foe].cr
  const count = roadFightCount(cr, levels, difficulty)
  const enemies = [{ creature: foe, count, boss: false }]
  const fight = fightOption(
    ctx.content,
    enemies,
    ambush,
    unhurt(plain(check.outcomes.success), 'win'),
    fleeOf(stage),
    ending(unhurt(plain(check.outcomes.fail), 'lose'))
  )
  // An authored parley (the hostile-group archetype's) stands for it, written for the scene.
  if (stage.options.some((o) => o.id === 'parley')) return [fight]
  const crs = enemies.flatMap((e) => Array.from({ length: e.count }, () => cr))
  const talkCr = site ?? groupCr(crs, levels.length)
  // Written at standard difficulty at a site, whose CR hardens it like every check there.
  const dc = site !== null ? CRISIS_DC_BASE : crDc(talkCr)
  const toll = Math.max(
    PARLEY_TOLL_MIN,
    Math.round(PARLEY_TOLL_SHARE * typicalPay(crLevel(talkCr)))
  )
  return [fight, parleyOption(parleySkill(ctx.party), dc, toll)]
}

/** A climax stage's Fight: the boss and as many henchmen as the budget allows. */
function climaxFight(stage: Stage, ctx: FightContext, cr: number, climax: Climax): Option[] {
  const challenge = stage.challenge
  const boss = ctx.content.creatures[climax.boss]
  if (!challenge || !boss) return []
  const levels = budgetLevels(ctx.party, cr)
  if (levels.length === 0) return []
  const henchmen = climax.henchmen ? ctx.content.creatures[climax.henchmen] : undefined
  const count = henchmen ? henchmenCount(boss.cr, henchmen.cr, levels, CLIMAX_FIGHT_DIFFICULTY) : 0
  const enemies: FightEnemy[] = [
    { creature: boss.id, count: 1, boss: true },
    ...(henchmen && count > 0 ? [{ creature: henchmen.id, count, boss: false }] : []),
  ]
  return [
    fightOption(
      ctx.content,
      enemies,
      false,
      challenge.win,
      fleeOf(stage),
      ending(unhurt(challenge.lose, 'lose'))
    ),
  ]
}

/**
 * The snapshot with its Fight and Parley options added (see the top of this file). Unchanged when
 * nothing fits; the options come after the stage's own.
 */
export function withFights(situation: Situation, ctx: FightContext): Situation {
  const { setup } = ctx
  if (setup.kind === 'none' || situation.wonder) return situation
  let changed = false
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => {
      if (stage.options.some((o) => o.id === FIGHT_OPTION)) return [id, stage]
      const added =
        setup.kind === 'climax'
          ? climaxFight(stage, ctx, setup.cr, setup.climax)
          : stageFights(situation, id, stage, ctx, setup.kind === 'site' ? setup.cr : null)
      if (added.length === 0) return [id, stage]
      changed = true
      return [id, { ...stage, options: [...stage.options, ...added] }]
    })
  )
  return changed ? { ...situation, stages } : situation
}

/**
 * A won Fight pays what its stage's fight-like check would on a success: that check's default XP
 * at its final DC (after hardening), unless the win has XP of its own. Climaxes pay by their win.
 */
export function payFights(situation: Situation): Situation {
  let changed = false
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => {
      const check = combatCheck(stage)
      if (!check || stage.challenge) return [id, stage]
      const options = stage.options.map((o) => {
        if (o.kind !== 'fight' || o.id !== FIGHT_OPTION || !o.fight.win) return o
        const win = o.fight.win
        const xp = defaultXp(situation, win, Number(check.check.dc), 'success')
        if (xp <= 0) return o
        changed = true
        const paid = { ...win, effects: [...win.effects, { effect: 'xp' as const, amount: xp }] }
        return { ...o, fight: { ...o.fight, win: paid } }
      })
      return [id, { ...stage, options }]
    })
  )
  return changed ? { ...situation, stages } : situation
}

/** The open stage's Fight option, if it has one. */
export function stageFight(situation: Situation, stageId: string | null): FightOption | null {
  if (stageId === null || !Object.hasOwn(situation.stages, stageId)) return null
  const option = situation.stages[stageId].options.find((o) => o.kind === 'fight')
  return option?.kind === 'fight' ? option : null
}

/** An engine-made Fight or Parley (the simulated players leave them be for now). */
export const onTheLine = (optionId: string): boolean =>
  optionId === FIGHT_OPTION || optionId === PARLEY_OPTION
