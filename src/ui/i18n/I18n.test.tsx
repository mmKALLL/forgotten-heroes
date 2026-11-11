// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { App } from '../App'
import { en } from './en'
import { LANGUAGE_KEY, translate } from './I18n'
import { ja } from './ja'

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.lang = ''
})

describe('translate', () => {
  test('fills placeholders and picks the language', () => {
    expect(translate('en', 'top.day', { day: 3 })).toBe('Day 3')
    expect(translate('ja', 'top.day', { day: 3 })).toBe('3日目')
  })

  test('a key missing in Japanese falls back to English', () => {
    expect(ja['source.claude']).toBeUndefined()
    expect(translate('ja', 'source.claude')).toBe(en['source.claude'])
  })

  test('the Japanese dictionary only uses English keys and keeps their placeholders', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, text] of Object.entries(ja)) {
      expect(Object.hasOwn(en, key), key).toBe(true)
      expect(placeholders(text!), key).toEqual(placeholders(en[key as keyof typeof en]))
    }
  })
})

describe('language toggle', () => {
  test('English is the default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Forgotten Heroes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.documentElement.lang).toBe('en')
  })

  test('switches the visible strings at once, and back', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '日本語' }))
    expect(screen.getByRole('heading', { name: '忘れられし英雄たち' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '振る' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'パーティ' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('ja')
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { name: 'Forgotten Heroes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Roll' })).toBeTruthy()
  })

  test('the choice persists across reloads', async () => {
    const { unmount } = render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '日本語' }))
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('ja')
    unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: '忘れられし英雄たち' })).toBeTruthy()
  })
})
