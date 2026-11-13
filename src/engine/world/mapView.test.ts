import { expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import type { Kingdom } from '../../schema/world'
import { fixtureContent, makeState } from '../test-fixtures'
import { kingdomsByDistance, partyPoint } from './mapView'

const content = fixtureContent()
const kingdom = (id: string, domains: string[]): Kingdom => ({
  id,
  name: id,
  ancestry: 'human',
  seat: domains[0],
  domains,
  defence: 1,
})

const withKingdoms = (location: string | null) => {
  const s = makeState({ location })
  return {
    ...s,
    world: {
      ...s.world,
      kingdoms: [
        kingdom('isle', ['farisle-1']),
        kingdom('marsh', ['ashmoor-1']),
        kingdom('vale', ['greenvale-1', 'greenvale-2']),
      ],
    },
  }
}

test('kingdoms are listed nearest first, by their nearest domain', () => {
  const ids = (location: string | null) =>
    kingdomsByDistance(withKingdoms(location), content).map((k) => k.id)
  expect(ids('greenvale-1')).toEqual(['vale', 'marsh', 'isle'])
  expect(ids('farisle-1')).toEqual(['isle', 'marsh', 'vale'])
  // Nowhere on the map: the world's order.
  expect(ids(null)).toEqual(['isle', 'marsh', 'vale'])
})

test('on the road the party is drawn part of the way along it', () => {
  const s = makeState({ location: null })
  const travel = { from: 'greenvale-1', to: 'greenvale-2', km: 100, kmDone: 50, kmPerDay: 20 }
  const onRoad = { ...s, travel } as unknown as GameState
  expect(partyPoint(onRoad, content)).toEqual({ x: 1150, y: 1000 })
  // Half of the day under way: 10 km further along the 100 km road.
  expect(partyPoint(onRoad, content, 0.5)).toEqual({ x: 1180, y: 1000 })
})
