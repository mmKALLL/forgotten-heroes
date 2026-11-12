import { expect, test } from 'vitest'
import { formatDate, seasonOf } from './calendar'

test('a year is four seasons of 90 days', () => {
  expect(formatDate(1)).toBe('Day 1 · Spring 1, year 1')
  expect(formatDate(91)).toBe('Day 91 · Summer 1, year 1')
  expect(formatDate(360)).toBe('Day 360 · Winter 90, year 1')
  expect(formatDate(361)).toBe('Day 361 · Spring 1, year 2')
  expect(seasonOf(200)).toBe('Autumn')
})
