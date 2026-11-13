import type { Content } from '../../content/build'
import type { FightOption } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { chooseOption, currentOptions } from '../encounters/run'
import { stageFight } from '../encounters/fights'
import { onceKey, tierOutcome } from '../encounters/outcomes'
import { canAct } from '../rules/character'
import { appendLog } from '../log'
import { startCombat } from './fight'
import type { StartOptions } from './start'

// Choosing in an encounter with Fight and Parley (Plan 7 Track I; encounters/fights.ts). Fight on
// the line opens the fight at the encounter's footing (its Edge or Exposed, for the whole fight);
// its ending then applies its branch to the encounter (combat/fight.ts). A Parley's critical
// failure (its outcome carries the engine-made `fight` effect) opens the stage's Fight with the
// enemies striking first. Every other choice is the encounter's own (encounters/run.ts).

/** Opens a stage's Fight: the option is used up and the encounter's footing goes into the fight. */
function openFight(
  state: GameState,
  content: Content,
  stageId: string,
  option: FightOption,
  options: StartOptions = {}
): GameState {
  const encounter = state.encounter
  if (!encounter || !state.party.some(canAct)) return state
  const used = option.once ? [...encounter.used, onceKey(stageId, option)] : encounter.used
  const text = `You stand and fight: ${option.description ?? option.label}`
  const opened: GameState = {
    ...appendLog(state, text, 'info'),
    encounter: {
      ...encounter,
      used,
      position: 'normal',
      nextCheckModifier: 0,
      nextCheckReason: null,
      log: [...encounter.log, { text, tone: 'info' }],
    },
  }
  return startCombat(opened, content, option.fight, { footing: encounter.position, ...options })
}

/** `chooseOption` with Fight on the line and a Parley gone wrong. */
export function chooseInEncounter(
  state: GameState,
  optionId: string,
  actorId: string | undefined,
  content: Content
): GameState {
  const encounter = state.encounter
  if (!encounter || encounter.stage === null || state.combat !== null) return state
  const stageId = encounter.stage
  const option = currentOptions(encounter).find((o) => o.id === optionId)
  if (option?.kind === 'fight') return openFight(state, content, stageId, option)
  const next = chooseOption(state, optionId, actorId, content)
  if (option?.kind !== 'check' || !next.lastRoll || next.lastRoll === state.lastRoll) return next
  const rolled = tierOutcome(option, next.lastRoll.tier)
  if (!rolled.effects.some((e) => e.effect === 'fight')) return next
  // The fight starts on the same stage, unless the roll ended the encounter (no one standing).
  const fight =
    next.encounter?.stage === stageId ? stageFight(next.encounter.situation, stageId) : null
  return fight ? openFight(next, content, stageId, fight, { surprise: 'enemy' }) : next
}
