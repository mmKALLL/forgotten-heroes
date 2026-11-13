import { describe, expect, test } from 'vitest'
import { EffectSchema, RequirementSchema } from '../../schema/encounter'
import { STANDINGS } from '../../schema/types'
import { STANDING_POINTS, TRADE_REP_GP, TRADE_REP_MAX } from '../constants'
import { applyEffects, describeEffect } from '../encounters/effects'
import { unmetRequirements } from '../encounters/run'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { personDisplayName } from './people'
import {
  addReputation,
  encounterSettlementName,
  goodWord,
  kingdomReputation,
  peopleRows,
  settlementPoints,
  settlementStanding,
  standingOf,
  standingSpreadModifier,
  standingView,
  tradeReputation,
} from './reputation'

const content = fixtureContent()
const base = makeState()
const here = base.location!
const withPoints = (settlements: Record<string, number>) => ({
  ...base,
  reputation: { settlements },
})

describe('standing tiers', () => {
  test('each tier starts exactly at its threshold', () => {
    for (let i = 1; i < STANDINGS.length; i++) {
      const min = STANDING_POINTS[STANDINGS[i]]
      expect(standingOf(min)).toBe(STANDINGS[i])
      expect(standingOf(min - 1)).toBe(STANDINGS[i - 1])
    }
    expect(standingOf(0)).toBe('stranger')
  })

  test('the view of some points gives its tier, range and what it does, as the rules apply it', () => {
    const known = standingView(STANDING_POINTS.known)
    expect(known).toMatchObject({ standing: 'known', min: STANDING_POINTS.known })
    expect(known.max).toBe(STANDING_POINTS.liked - 1)
    expect(known.spread).toBeCloseTo(
      -standingSpreadModifier(withPoints({ [here]: STANDING_POINTS.known }), here) * 100
    )
    expect(known.rumourDc).toBeGreaterThan(0)
    const disliked = standingView(STANDING_POINTS.disliked)
    expect(disliked.spread).toBeLessThan(0)
    expect(disliked.rumourDc).toBeLessThan(0)
    expect(standingView(0)).toMatchObject({ spread: 0, rumourDc: 0 })
    expect(standingView(-100)).toMatchObject({ standing: 'hated', min: null })
    expect(standingView(1000)).toMatchObject({ standing: 'honoured', max: null })
  })
})

describe('addReputation', () => {
  test('adds points and logs only when the tier changes', () => {
    const known = STANDING_POINTS.known
    const a = addReputation(base, { settlement: here, amount: known - 1 })
    expect(a.log).toEqual(base.log)
    const b = addReputation(a, { settlement: here, amount: 1 })
    expect(settlementStanding(b, here)).toBe('known')
    expect(b.log.at(-1)).toMatchObject({ tone: 'good' })
    expect(b.log.at(-1)!.text).toContain(base.world.settlements[here].name)
    expect(Object.keys(b.reputation)).toEqual(['settlements'])
  })
})

describe('standingSpreadModifier', () => {
  test('liked narrows the spread, disliked widens it', () => {
    expect(standingSpreadModifier(base, here)).toBe(0)
    expect(
      standingSpreadModifier(withPoints({ [here]: STANDING_POINTS.liked }), here)
    ).toBeLessThan(0)
    expect(
      standingSpreadModifier(withPoints({ [here]: STANDING_POINTS.disliked }), here)
    ).toBeGreaterThan(0)
  })
})

describe('encounters', () => {
  const domain = Object.keys(base.world.settlements).find((id) => id !== here)!
  const inEncounter = { ...base, encounter: makeEncounter({ domain }) }

  test('the reputation effect changes the domain settlement, as its chip says', () => {
    const effect = EffectSchema.parse({ effect: 'reputation', amount: 3 })
    const chip = describeEffect(effect, 'Lyra', encounterSettlementName(inEncounter))
    expect(chip).toBe(`+3 reputation in ${base.world.settlements[domain].name}`)
    const after = applyEffects(inEncounter, [effect], { content })
    expect(settlementPoints(after, domain)).toBe(3)
    expect(settlementPoints(after, here)).toBe(0)
  })

  test('the standing requirement gates on the domain settlement', () => {
    const requires = [RequirementSchema.parse({ req: 'standing', min: 'known' })]
    expect(unmetRequirements(inEncounter, requires)).toEqual([
      `needs reputation ${STANDING_POINTS.known} in ${base.world.settlements[domain].name}`,
    ])
    const known = {
      ...inEncounter,
      reputation: { settlements: { [domain]: STANDING_POINTS.known } },
    }
    expect(unmetRequirements(known, requires)).toEqual([])
  })
})

describe('tradeReputation', () => {
  test('a point per TRADE_REP_GP traded, capped per arrival', () => {
    let state = base
    state = tradeReputation(state, TRADE_REP_GP - 1)
    expect(settlementPoints(state, here)).toBe(0)
    state = tradeReputation(state, 1)
    expect(settlementPoints(state, here)).toBe(1)
    state = tradeReputation(state, TRADE_REP_GP * (TRADE_REP_MAX + 5))
    expect(settlementPoints(state, here)).toBe(TRADE_REP_MAX)
    // A new arrival clears doneHere, so trading earns standing again.
    state = tradeReputation({ ...state, doneHere: [] }, TRADE_REP_GP)
    expect(settlementPoints(state, here)).toBe(TRADE_REP_MAX + 1)
  })
})

describe('goodWord', () => {
  test('raises standing in every settlement of the kingdom, with one journal line', () => {
    const kingdom = base.world.kingdoms[0]
    const after = goodWord(base, kingdom.id, 4)
    for (const id of kingdom.domains) expect(settlementPoints(after, id)).toBe(4)
    const others = Object.keys(base.world.settlements).filter((id) => !kingdom.domains.includes(id))
    for (const id of others) expect(settlementPoints(after, id)).toBe(0)
    expect(after.log).toHaveLength(base.log.length + 1)
  })
})

describe('kingdomReputation', () => {
  test('is the average of its settlements’ points, derived from them alone', () => {
    const kingdom = base.world.kingdoms.find((k) => k.domains.length > 1)!
    const [first, second] = kingdom.domains
    expect(kingdomReputation(base, first)).toMatchObject({ id: kingdom.id, points: 0 })
    const n = kingdom.domains.length
    const state = withPoints({ [first]: 4 * n, [second]: -2 * n })
    const view = kingdomReputation(state, second)!
    expect(view).toMatchObject({ name: kingdom.name, points: 2, settlements: n })
    expect(view.standing).toBe(settlementStanding(withPoints({ [here]: 2 }), here))
    // A good word moves the kingdom by its points.
    expect(kingdomReputation(goodWord(state, kingdom.id, 3), first)!.points).toBe(5)
  })

  test('is null for a settlement outside any kingdom', () => {
    const outside = Object.keys(base.world.settlements).find(
      (id) => !base.world.kingdoms.some((k) => k.domains.includes(id))
    )
    if (outside) expect(kingdomReputation(base, outside)).toBeNull()
    expect(kingdomReputation(base, 'nowhere')).toBeNull()
  })
})

describe('peopleRows', () => {
  test('lists the people here with titles from their role, and no reputation', () => {
    const rows = peopleRows(base, content)
    expect(rows.length).toBeGreaterThan(0)
    const ids = Object.keys(base.world.people).filter(
      (id) => base.world.people[id].settlement === here
    )
    expect(rows.map((r) => r.id).sort()).toEqual(ids.sort())
    for (const row of rows) {
      const person = base.world.people[row.id]
      const titles = content.personRoles[person.role].titles
      expect(row.name.endsWith(person.name)).toBe(true)
      if (titles.length > 0) expect(titles).toContain(row.name.slice(0, -person.name.length - 1))
      expect(row).not.toHaveProperty('points')
      expect(personDisplayName(base.world, content, row.id)).toBe(row.name)
    }
  })
})
