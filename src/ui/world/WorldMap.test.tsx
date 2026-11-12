// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { step } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import { WorldMap, viewBoxFor } from './WorldMap'

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
  expect(container.querySelectorAll('line.route')).toHaveLength(4)
  expect(container.querySelectorAll('line.route.sea')).toHaveLength(1)
})

test('the road to the selected neighbour, and the journey under way, are highlighted', () => {
  const state = makeState({ location: 'greenvale-1' })
  const props = { content, onSelect: () => {}, imageUrl: null }
  const { container, rerender } = render(
    <WorldMap {...props} state={state} selected="greenvale-2" />
  )
  expect(container.querySelectorAll('line.active')).toHaveLength(1)
  const out = step(state, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
  rerender(<WorldMap {...props} state={out} selected={null} />)
  expect(container.querySelectorAll('line.active')).toHaveLength(1)
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
