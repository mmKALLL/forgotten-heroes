// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { SAVE_KEY, UNREADABLE_SAVE_KEY, serialize } from '../engine/save'
import { newGame } from '../engine/state'
import { fixtureContent } from '../engine/test-fixtures'
import {
  ACTIVE_SLOT_KEY,
  activeSlot,
  deleteSlot,
  loadSlot,
  readSlot,
  setActiveSlot,
  slotKey,
  unreadableKey,
  writeSlot,
} from './saves'

const content = fixtureContent()

afterEach(() => localStorage.clear())

test('a save from before slots is slot 1, untouched, and slot 1 is played', () => {
  const text = serialize(newGame(7, content))
  localStorage.setItem(SAVE_KEY, text)
  expect(slotKey(1)).toBe(SAVE_KEY)
  expect(unreadableKey(1)).toBe(UNREADABLE_SAVE_KEY)
  expect(activeSlot()).toBe(1)
  expect(loadSlot(1, content)?.seed).toBe(7)
  expect(readSlot(2, content)).toEqual({ kind: 'empty' })
  expect(localStorage.getItem(SAVE_KEY)).toBe(text)
  expect(Object.keys(localStorage)).toEqual([SAVE_KEY])
})

test('each slot has its own key, and the active slot is remembered within range', () => {
  writeSlot(2, newGame(2, content))
  writeSlot(3, newGame(3, content))
  expect(slotKey(2)).not.toBe(slotKey(3))
  expect(loadSlot(2, content)?.seed).toBe(2)
  expect(loadSlot(3, content)?.seed).toBe(3)
  setActiveSlot(3)
  expect(activeSlot()).toBe(3)
  setActiveSlot(9)
  expect(activeSlot()).toBe(3)
  localStorage.setItem(ACTIVE_SLOT_KEY, 'nonsense')
  expect(activeSlot()).toBe(1)
})

test('an unreadable slot says so, and is kept under its own backup key when loaded or deleted', () => {
  const broken = JSON.stringify({ version: 999 })
  localStorage.setItem(slotKey(2), broken)
  expect(readSlot(2, content)).toEqual({ kind: 'unreadable' })
  expect(localStorage.getItem(unreadableKey(2))).toBeNull()
  deleteSlot(2, content)
  expect(readSlot(2, content)).toEqual({ kind: 'empty' })
  expect(localStorage.getItem(unreadableKey(2))).toBe(broken)
  expect(localStorage.getItem(UNREADABLE_SAVE_KEY)).toBeNull()
})

test('blocked storage leaves every slot empty and throws nothing', () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('blocked')
    },
  })
  try {
    expect(activeSlot()).toBe(1)
    expect(readSlot(1, content)).toEqual({ kind: 'empty' })
    expect(() => writeSlot(1, newGame(1, content))).not.toThrow()
    expect(() => deleteSlot(1, content)).not.toThrow()
  } finally {
    Object.defineProperty(globalThis, 'localStorage', real)
  }
})
