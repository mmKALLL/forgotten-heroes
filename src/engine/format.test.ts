import { expect, test } from 'vitest'
import { formatFaces } from './format'

test('formatFaces shows a single face or an en-dash range', () => {
  expect(formatFaces({ min: 20, max: 20 })).toBe('20')
  expect(formatFaces({ min: 11, max: 19 })).toBe('11–19')
})
