import { expect, test } from 'vitest'
import { formatFaces, formatFacesShort } from './format'

test('formatFaces shows a single face or an en-dash range', () => {
  expect(formatFaces({ min: 20, max: 20 })).toBe('20')
  expect(formatFaces({ min: 11, max: 19 })).toBe('11–19')
})

test('formatFacesShort shows a tier by its lowest face, except the lone critical 1 and 20', () => {
  expect(formatFacesShort({ min: 1, max: 1 })).toBe('1')
  expect(formatFacesShort({ min: 20, max: 20 })).toBe('20')
  expect(formatFacesShort({ min: 2, max: 4 })).toBe('2+')
  expect(formatFacesShort({ min: 12, max: 19 })).toBe('12+')
  expect(formatFacesShort({ min: 19, max: 19 })).toBe('19+')
})
