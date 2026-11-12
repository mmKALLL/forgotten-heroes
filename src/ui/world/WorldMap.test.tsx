// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { step } from '../../engine/state'
import { routeOptions } from '../../engine/travel/preview'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import { DANGER_COLOURS, WorldMap, nearestInDirection, viewBoxFor } from './WorldMap'

const content = fixtureContent()
afterEach(cleanup)

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
