// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { edgesFrom } from '../../engine/world/graph'
import { territory } from '../../engine/world/territory'
import { step } from '../../engine/state'
import { routeOptions } from '../../engine/travel/preview'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import {
  DANGER_COLOURS,
  KINGDOM_COLOURS,
  KINGDOM_OVERLAY_KEY,
  WorldMap,
  kingdomColours,
  nearestInDirection,
  viewBoxFor,
} from './WorldMap'

const content = fixtureContent()
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const map = () => within(screen.getByRole('group', { name: 'Map of Altaeus' }))

test('every settlement is a button; the party’s place is marked; a click selects', async () => {
  const state = makeState({ location: 'greenvale-1' })
  const onSelect = vi.fn()
  render(
    <WorldMap content={content} state={state} selected={null} onSelect={onSelect} imageUrl={null} />
  )
  expect(map().getAllByRole('button')).toHaveLength(4)
  const here = settlementName(state, 'greenvale-1')
  expect(map().getByRole('button', { name: `${here} (you are here)` })).toBeTruthy()
  await userEvent.click(map().getByRole('button', { name: settlementName(state, 'greenvale-2') }))
  expect(onSelect).toHaveBeenCalledWith('greenvale-2')
})

test('without the map image: parchment, region names and a note', () => {
  const { container } = render(
    <WorldMap
      content={content}
      state={makeState()}
      selected={null}
      onSelect={() => {}}
      imageUrl={null}
    />
  )
  expect(container.querySelector('image')).toBeNull()
  expect(container.querySelector('rect.map-parchment')).toBeTruthy()
  expect(screen.getByText('Ashmoor')).toBeTruthy()
  expect(screen.getByText(/not in assets/)).toBeTruthy()
})

test('with the map image: the image, and the names left to the map', () => {
  const { container } = render(
    <WorldMap
      content={content}
      state={makeState()}
      selected={null}
      onSelect={() => {}}
      imageUrl="/altaeus.jpg"
    />
  )
  expect(container.querySelector('image')?.getAttribute('href')).toBe('/altaeus.jpg')
  expect(screen.queryByText('Ashmoor')).toBeNull()
  expect(screen.queryByText(/not in assets/)).toBeNull()
})

test('sea crossings are drawn apart from the roads', () => {
  const { container } = render(
    <WorldMap
      content={content}
      state={makeState()}
      selected={null}
      onSelect={() => {}}
      imageUrl={null}
    />
  )
  const roads = container.querySelectorAll('.world-map line.route')
  expect(roads).toHaveLength(4)
  expect(container.querySelectorAll('.world-map line.route.sea')).toHaveLength(1)
  // Each road has a dark casing beneath it, and its colour says how dangerous it is.
  expect(container.querySelectorAll('.world-map line.route-casing')).toHaveLength(4)
  for (const road of roads) {
    const danger = Number(/danger-(\d)/.exec(road.getAttribute('class') ?? '')![1])
    expect((road as SVGLineElement).style.stroke).toBe(hexToRgb(DANGER_COLOURS[danger]))
  }
})

const hexToRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

test('a legend names the four road dangers and sea crossings', () => {
  render(
    <WorldMap
      content={content}
      state={makeState()}
      selected={null}
      onSelect={() => {}}
      imageUrl="/altaeus.jpg"
    />
  )
  const legend = within(screen.getByRole('list', { name: 'Road danger' }))
  expect(legend.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Safe',
    'Watchful',
    'Dangerous',
    'Deadly',
    'Sea crossing',
  ])
})

test('only the party’s place and its roads’ ends are tab stops; arrows reach the rest', async () => {
  const state = makeState({ location: 'greenvale-1' })
  const reachable = routeOptions(state, content).map((r) => r.to)
  render(
    <WorldMap content={content} state={state} selected={null} onSelect={() => {}} imageUrl={null} />
  )
  const markers = map().getAllByRole('button')
  const stops = markers.filter((m) => m.getAttribute('tabindex') === '0')
  expect(stops).toHaveLength(1 + reachable.length)
  expect(stops.length).toBeLessThan(markers.length)
  const far = map().getByRole('button', { name: settlementName(state, 'farisle-1') })
  expect(far.getAttribute('tabindex')).toBe('-1')

  // Tab goes from one stop to the next (after the zoom button), skipping the far settlement.
  await userEvent.tab()
  expect(document.activeElement?.textContent).toBe('Kingdoms')
  await userEvent.tab()
  expect(document.activeElement?.textContent).toBe('Zoom to party')
  await userEvent.tab()
  expect(document.activeElement).toBe(stops[0])
  for (let i = 1; i < stops.length; i++) await userEvent.tab()
  expect(document.activeElement).toBe(stops[stops.length - 1])
  await userEvent.tab()
  expect(markers).not.toContain(document.activeElement)

  // The arrow keys move to the nearest settlement that way, tab stop or not.
  const here = map().getByRole('button', { name: /you are here/ })
  here.focus()
  const sites = Object.values(content.settlements)
  const from = content.settlements['greenvale-1'].at
  const moves = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }
  const [key, dir] = Object.entries(moves).find(([, d]) => nearestInDirection(from, d, sites))!
  const target = nearestInDirection(from, dir, sites)!
  await userEvent.keyboard(`{${key}}`)
  expect(document.activeElement?.getAttribute('aria-label')).toMatch(
    new RegExp(`^${settlementName(state, target)}`)
  )
})

test('nearestInDirection prefers settlements straight ahead', () => {
  const sites = [
    { id: 'ahead', at: { x: 100, y: 10 } },
    { id: 'aside', at: { x: 60, y: 60 } },
    { id: 'behind', at: { x: -10, y: 0 } },
  ]
  expect(nearestInDirection({ x: 0, y: 0 }, { x: 1, y: 0 }, sites)).toBe('ahead')
  expect(nearestInDirection({ x: 0, y: 0 }, { x: 0, y: 1 }, sites)).toBe('aside')
  expect(nearestInDirection({ x: 0, y: 0 }, { x: -1, y: 0 }, sites)).toBe('behind')
  expect(nearestInDirection({ x: 0, y: 0 }, { x: 0, y: -1 }, sites)).toBeNull()
})

test('the road to the selected neighbour, and the journey under way, are highlighted', () => {
  const state = makeState({ location: 'greenvale-1' })
  const props = { content, onSelect: () => {}, imageUrl: null }
  const { container, rerender } = render(
    <WorldMap {...props} state={state} selected="greenvale-2" />
  )
  expect(container.querySelectorAll('line.route.active')).toHaveLength(1)
  const out = step(state, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
  rerender(<WorldMap {...props} state={out} selected={null} />)
  expect(container.querySelectorAll('line.route.active')).toHaveLength(1)
  expect(container.querySelector('circle.party-marker')).toBeTruthy()
  expect(map().queryByRole('button', { name: /you are here/ })).toBeNull()
})

test('zooming centres on the party without leaving the map', () => {
  expect(viewBoxFor({ x: 100, y: 100 }, true)).toBe('0 0 1600 1200')
  expect(viewBoxFor({ x: 2000, y: 1500 }, true)).toBe('1200 900 1600 1200')
  expect(viewBoxFor({ x: 4000, y: 3000 }, true)).toBe('2496 1872 1600 1200')
  expect(viewBoxFor(null, true)).toBe('0 0 4096 3072')
  expect(viewBoxFor({ x: 2000, y: 1500 }, false)).toBe('0 0 4096 3072')
})

/** The fixture world with these POIs discovered (and cleared). */
const discover = (state: ReturnType<typeof makeState>, ids: string[], cleared: string[] = []) => {
  const next = structuredClone(state)
  for (const id of ids) next.world.pois[id].discovered = true
  for (const id of cleared) next.world.pois[id].cleared = true
  return next
}

test('undiscovered sites are not drawn; discovered ones are labelled buttons that select', async () => {
  const state = makeState({ location: 'greenvale-1' })
  const onSelect = vi.fn()
  const { rerender, container } = render(
    <WorldMap content={content} state={state} selected={null} onSelect={onSelect} imageUrl={null} />
  )
  expect(container.querySelectorAll('.poi')).toHaveLength(0)
  const found = discover(state, ['poi-1', 'poi-3'], ['poi-3'])
  rerender(
    <WorldMap content={content} state={found} selected={null} onSelect={onSelect} imageUrl={null} />
  )
  expect(map().getAllByRole('button')).toHaveLength(6)
  const hut = map().getByRole('button', { name: 'Old Wen’s hut (expert)' })
  const stones = map().getByRole('button', { name: 'The Hum (wonder)' })
  expect(hut.getAttribute('tabindex')).toBe('-1')
  expect(stones.getAttribute('class')).toMatch(/\bcleared\b/)
  expect(hut.getAttribute('class')).not.toMatch(/\bcleared\b/)
  // Each category draws its own glyph.
  expect(hut.querySelector('.glyph-expert')).toBeTruthy()
  expect(stones.querySelector('.glyph-wonder')).toBeTruthy()
  await userEvent.click(hut)
  expect(onSelect).toHaveBeenCalledWith('poi-1')
  hut.focus()
  await userEvent.keyboard('{Enter}')
  expect(onSelect).toHaveBeenLastCalledWith('poi-1')
})

test('the arrow keys reach discovered sites; the party’s site and the selection are tab stops', async () => {
  // The Hum (poi-3) is at spot-0004, between Harbourne (greenvale-1) and the eastern towns.
  const state = discover(makeState({ location: 'greenvale-1' }), ['poi-3'])
  const { rerender } = render(
    <WorldMap content={content} state={state} selected={null} onSelect={() => {}} imageUrl={null} />
  )
  const here = map().getByRole('button', { name: /you are here/ })
  here.focus()
  const from = content.settlements['greenvale-1'].at
  const at = content.landSpots['spot-0004'].at
  const dir = { x: Math.sign(at.x - from.x), y: 0 }
  const key = dir.x > 0 ? 'ArrowRight' : 'ArrowLeft'
  await userEvent.keyboard(`{${key}}`)
  expect(document.activeElement?.getAttribute('aria-label')).toBe('The Hum (wonder)')

  const there = { ...state, location: 'poi-3' }
  rerender(
    <WorldMap
      content={content}
      state={there}
      selected="poi-3"
      onSelect={() => {}}
      imageUrl={null}
    />
  )
  const site = map().getByRole('button', { name: 'The Hum (wonder) (you are here)' })
  expect(site.getAttribute('tabindex')).toBe('0')
  expect(site.getAttribute('aria-pressed')).toBe('true')
})

test('the kingdom overlay tints every land spot in its kingdom’s colour, and is remembered', async () => {
  const state = makeState({ location: 'greenvale-1' })
  const props = { content, state, selected: null, onSelect: () => {}, imageUrl: null }
  const { container, unmount } = render(<WorldMap {...props} />)
  const toggle = screen.getByRole('button', { name: 'Kingdoms' })
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  expect(container.querySelector('.kingdom-overlay')).toBeNull()
  expect(screen.queryByRole('list', { name: 'Kingdom colours' })).toBeNull()

  await userEvent.click(toggle)
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  const spots = container.querySelectorAll<SVGRectElement>('.kingdom-overlay rect')
  const land = territory(content)
  expect(spots).toHaveLength(Object.keys(land.domainOf).length)
  const colours = kingdomColours(state.world.kingdoms)
  for (const rect of spots) {
    const domain = land.domainOf[rect.dataset.spot!]
    const kingdom = state.world.domains[domain].kingdom
    expect(rect.style.fill).toBe(hexToRgb(colours.get(kingdom)!))
  }
  // Seats wear a crown, and the legend names the kingdoms.
  expect(container.querySelectorAll('.crown')).toHaveLength(state.world.kingdoms.length)
  const legend = within(screen.getByRole('list', { name: 'Kingdom colours' }))
  expect(legend.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
    state.world.kingdoms.map((k) => k.name)
  )
  expect(localStorage.getItem(KINGDOM_OVERLAY_KEY)).toBe('true')

  // Remembered for this viewer, and off again on a second click.
  unmount()
  const again = render(<WorldMap {...props} />)
  expect(again.container.querySelector('.kingdom-overlay')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Kingdoms' }))
  expect(again.container.querySelector('.kingdom-overlay')).toBeNull()
  expect(localStorage.getItem(KINGDOM_OVERLAY_KEY)).toBe('false')
})

test('twelve kingdoms get twelve distinct colours', () => {
  const kingdoms = Array.from({ length: 12 }, (_, i) => ({ id: `kingdom-${i + 1}` }))
  const colours = kingdomColours(kingdoms)
  expect(new Set(colours.values()).size).toBe(12)
  expect(new Set(KINGDOM_COLOURS).size).toBe(KINGDOM_COLOURS.length)
})

test('paths to discovered sites are drawn like roads, and highlighted when chosen', () => {
  const state = discover(makeState({ location: 'ashmoor-1' }), ['poi-1'])
  const paths = edgesFrom(state, content, 'poi-1')
  const props = { content, state, onSelect: () => {}, imageUrl: null }
  const { container, rerender } = render(<WorldMap {...props} selected={null} />)
  const lines = container.querySelectorAll<SVGLineElement>('line.route.path')
  expect(lines).toHaveLength(paths.length)
  for (const [i, line] of [...lines].entries()) {
    expect(line.style.stroke).toBe(hexToRgb(DANGER_COLOURS[paths[i].danger]))
  }
  expect(container.querySelectorAll('line.route.path.active')).toHaveLength(0)
  rerender(<WorldMap {...props} selected="poi-1" />)
  expect(container.querySelectorAll('line.route.path.active')).toHaveLength(1)
  // The site is a road's end now, so it is a tab stop.
  expect(
    map().getByRole('button', { name: 'Old Wen’s hut (expert)' }).getAttribute('tabindex')
  ).toBe('0')
  // Undiscovered sites have no paths.
  rerender(<WorldMap {...props} state={makeState({ location: 'ashmoor-1' })} selected={null} />)
  expect(container.querySelectorAll('line.route.path')).toHaveLength(0)
})

test('the party on a path to a site is drawn along it', () => {
  const state = discover(makeState({ location: 'ashmoor-1' }), ['poi-1'])
  const path = edgesFrom(state, content, 'ashmoor-1').find((r) => r.from === 'poi-1')!
  const out = step(state, { type: 'travel', routeId: path.id }, content)
  expect(out.travel).not.toBeNull()
  const { container } = render(
    <WorldMap content={content} state={out} selected={null} onSelect={() => {}} imageUrl={null} />
  )
  expect(container.querySelector('circle.party-marker')).toBeTruthy()
  expect(container.querySelectorAll('line.route.path.active')).toHaveLength(1)
})
