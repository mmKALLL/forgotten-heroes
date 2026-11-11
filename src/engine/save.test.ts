import { expect, test } from 'vitest'
import { deserialize, serialize } from './save'
import { newGame } from './state'
import { fixtureContent } from './test-fixtures'

test('round trip', () => {
  const state = newGame(5, fixtureContent())
  expect(deserialize(serialize(state))).toEqual(state)
})

test('garbage and wrong versions load as null', () => {
  expect(deserialize('not json')).toBeNull()
  expect(deserialize(JSON.stringify({ version: 999 }))).toBeNull()
})
