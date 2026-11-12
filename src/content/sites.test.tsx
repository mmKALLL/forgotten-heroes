// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { newGame, step } from '../engine/state'
import { edgesFrom } from '../engine/world/graph'
import { GameStateSchema, type GameState } from '../schema/state'
import { PlacePanel } from '../ui/world/PlacePanel'
import { PoiPanel } from '../ui/world/PoiPanel'
import { DEFAULT_TRAVEL_PREFS } from '../ui/world/travelPrefs'
import { WorldMap } from '../ui/world/WorldMap'
import { loadBundledContent } from './bundled'

/** The UI and the site rules over the bundled POI types and site situations (Plan 3b, merged). */
const content = loadBundledContent()
const types = Object.values(content.poiTypes)
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const capitalised = (s: string) => s[0].toUpperCase() + s.slice(1)
const CATEGORY_TEXT: Record<string, string> = { quest: 'quest site' }

/** A fresh game on seed 1 with its first POI turned into `typeId`, discovered, the party there. */
function atSite(typeId: string): { state: GameState; id: string } {
  const state = newGame(1, content)
  const [id, poi] = Object.entries(state.world.pois)[0]
  const type = content.poiTypes[typeId]
  state.world.pois[id] = {
    ...poi,
    type: typeId,
    name: `The ${type.name}`,
    threat: type.hostile ? (type.threat?.max ?? 1) : 0,
    discovered: true,
  }
  state.location = id
  return { state, id }
}

const props = { prefs: DEFAULT_TRAVEL_PREFS, onPrefs: () => {}, onSelect: () => {} }

describe('every POI type in the bundled content', () => {
  test('there are all seven categories', () => {
    expect(new Set(types.map((t) => t.category)).size).toBe(7)
  })

  test.each(types.map((t) => [t.id]))(
    '%s shows in its panel and plays a site situation',
    async (typeId) => {
      const type = content.poiTypes[typeId]
      const { state } = atSite(typeId)
      const onAction = vi.fn()
      render(
        <PoiPanel content={content} state={state} selected={null} onAction={onAction} {...props} />
      )
      const panel = within(screen.getByRole('region', { name: 'Site' }))
      expect(panel.getByRole('heading', { name: `The ${type.name}` })).toBeTruthy()
      const category = capitalised(CATEGORY_TEXT[type.category] ?? type.category)
      expect(panel.getByText(`${category} · ${type.name}`)).toBeTruthy()
      expect(panel.queryByText(/A spring here/) !== null).toBe(type.water)
      expect(panel.queryByText(/^Feeds the /) !== null).toBe(type.hostile)
      const entered = type.category === 'dungeon' || type.category === 'lair'
      await userEvent.click(panel.getByRole('button', { name: entered ? 'Enter' : 'Visit' }))
      expect(onAction).toHaveBeenCalledWith({ type: 'visitPoi' })

      const visited = step(state, { type: 'visitPoi' }, content)
      expect(visited.encounter?.poi).toBe(state.location)
      expect(type.situations).toContain(visited.encounter?.situation.id)
      expect(GameStateSchema.parse(visited)).toEqual(visited)
    }
  )
})

test('the herbwife’s spring is shown on the path to it from her domain', () => {
  const { state, id } = atSite('herbwife-spring')
  const home = state.world.pois[id].domain
  const fromHome = { ...state, location: home }
  render(
    <PlacePanel content={content} state={fromHome} selected={id} onAction={() => {}} {...props} />
  )
  const path = edgesFrom(fromHome, content, home).find((e) => e.to === id || e.from === id)
  expect(path).toBeTruthy()
  const road = within(screen.getByRole('group', { name: `To ${state.world.pois[id].name}` }))
  expect(road.getByText("Expert · Herbwife's spring")).toBeTruthy()
  expect(road.getByText('A spring here: arriving refills the waterskins.')).toBeTruthy()
})

describe.each([1, 2, 3, 4, 5])('seed %i', (seed) => {
  test('the map draws every discovered site, with a glyph or an icon', () => {
    const state = newGame(seed, content)
    for (const poi of Object.values(state.world.pois)) poi.discovered = true
    const { container } = render(
      <WorldMap
        content={content}
        state={state}
        selected={null}
        onSelect={() => {}}
        imageUrl={null}
      />
    )
    const drawn = container.querySelectorAll('g.poi')
    expect(drawn).toHaveLength(Object.keys(state.world.pois).length)
    for (const g of drawn) expect(g.querySelector('.poi-glyph, .poi-icon')).toBeTruthy()
  })

  test('exploring the starting domain with the real situations keeps the state valid', () => {
    let state = newGame(seed, content)
    for (let i = 0; i < 6 && !state.encounter; i++) {
      state = step(state, { type: 'explore' }, content)
      expect(GameStateSchema.parse(state)).toEqual(state)
    }
    expect(state.day).toBeGreaterThan(1)
  })
})
