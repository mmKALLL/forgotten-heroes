import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../../schema/state'
import { newGame } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { quote } from '../economy/market'
import { settlementReach } from './reach'
import { siteLand } from '../crisis/text'
import { bestTrade, crusadeGoal, crusader, trader, type TraderWhy } from './trader'

const content = fixtureContent()
const shops = ['inn-tavern', 'adventuring-supplies', 'jewelry-trader']

/** In greenvale-1 with a jeweller and a general store, and gold to spend. */
function inTown(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: 'greenvale-1', gold: 500, goods: { food: 4, water: 4 } })
  const settlements = { ...s.world.settlements }
  for (const id of Object.keys(settlements))
    settlements[id] = { ...settlements[id], services: shops }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}

describe('bestTrade', () => {
  const s = inTown()
  const [there] = [...settlementReach(content, 'greenvale-1').keys()]
  const gems = quote(s, content, 'greenvale-1', 'gems', 'buy', 1)!.unitFirst

  test('finds nothing without prices from elsewhere', () => {
    expect(bestTrade(s, content, 400, 100)).toBeNull()
  })

  test('buys where the price book says another market pays well, within the budget', () => {
    const book = {
      [there]: { day: s.day, heard: false, prices: { gems: { buy: null, sell: gems * 2 } } },
    }
    const plan = bestTrade({ ...s, priceBook: book }, content, 400, 100)
    expect(plan).toMatchObject({ good: 'gems', to: there })
    expect(plan!.units).toBeGreaterThan(0)
    expect(plan!.cost).toBeLessThanOrEqual(400)
    expect(plan!.revenue).toBeGreaterThan(plan!.cost)
    // Too poor for a single gem: no plan.
    expect(bestTrade({ ...s, priceBook: book }, content, gems / 2, 100)).toBeNull()
  })

  test('skips a market that pays less than the margin over the price here', () => {
    const book = {
      [there]: { day: s.day, heard: false, prices: { gems: { buy: null, sell: gems } } },
    }
    expect(bestTrade({ ...s, priceBook: book }, content, 400, 100)).toBeNull()
  })
})

describe('the trader', () => {
  test('replays identically, keeps a valid state and says why it took each action', () => {
    const whys: TraderWhy[] = []
    const run = trader(newGame(2024, content), content, 6, {
      onStep: (_b, _a, _s, why) => whys.push(why),
    })
    expect(GameStateSchema.parse(run)).toEqual(run)
    expect(run.day).toBeGreaterThan(5)
    expect(trader(newGame(2024, content), content, 6)).toEqual(run)
    expect(whys).toContain('travel')
  })

  test('stops once `until` holds', () => {
    const run = trader(newGame(7, content), content, 50, { until: (s) => s.day >= 10 })
    expect(run.day).toBeGreaterThanOrEqual(10)
    expect(run.day).toBeLessThan(25)
  })
})

describe('the crusader', () => {
  const discover = (state: GameState, id: string): GameState => ({
    ...state,
    world: {
      ...state.world,
      pois: { ...state.world.pois, [id]: { ...state.world.pois[id], discovered: true } },
    },
  })

  test('goes after what the party knows: the reveal site, then the act’s land, then its site', () => {
    const s = makeState()
    const crisis = s.crisis!
    expect(crusadeGoal(s, content)).toBeNull()
    const reveal = discover(s, crisis.reveal)
    expect(crusadeGoal(reveal, content)).toEqual({ poi: crisis.reveal, land: null })
    const learned = { ...reveal, crisis: { ...crisis, learned: 1, clues: [1, 0, 0] } }
    const land = siteLand(learned, content, crisis.acts[0].poi)
    expect(crusadeGoal(learned, content)).toEqual({ poi: null, land })
    const site = crisis.acts[0].poi
    expect(crusadeGoal(discover(learned, site), content)).toEqual({ poi: site, land: null })
  })

  test('replays identically and keeps a valid state', () => {
    const run = crusader(newGame(2024, content), content, 12)
    expect(GameStateSchema.parse(run)).toEqual(run)
    expect(crusader(newGame(2024, content), content, 12)).toEqual(run)
  })
})
