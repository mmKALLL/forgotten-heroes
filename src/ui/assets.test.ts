import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { WORLD_MAP_IMAGE, assetUrl } from './assets'

test('images under assets/ resolve to URLs when present, and to null when not', () => {
  expect(assetUrl('world maps/nowhere.jpg')).toBeNull()
  const present = existsSync(new URL(`../../assets/${WORLD_MAP_IMAGE}`, import.meta.url))
  expect(typeof assetUrl(WORLD_MAP_IMAGE)).toBe(present ? 'string' : 'object')
})
