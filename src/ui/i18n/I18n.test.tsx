// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { App } from '../App'
import { DEV_EXPANDED_KEY } from '../DevArea'
import { en } from './en'
import { LANGUAGE_KEY, translate } from './I18n'
import { ja } from './ja'

// The practice check lives in the developer tools, collapsed by default.
beforeEach(() => localStorage.setItem(DEV_EXPANDED_KEY, 'true'))

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

describe('content in Japanese', () => {
  test('party cards and practice checks use translated skill, class and ancestry names', async () => {
    localStorage.setItem(LANGUAGE_KEY, 'ja')
    render(<App />)
    expect(screen.getByRole('option', { name: '説得' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '魅力' })).toBeTruthy()
    const summaries = screen
      .getAllByRole('article')
      .map((a) => a.querySelector('.muted')!.textContent)
    expect(summaries.every((s) => /^\S+・\S+ · Lv\d/.test(s ?? ''))).toBe(true)
  })

  test('a translated encounter plays in Japanese; toggling back shows it in English', async () => {
    localStorage.setItem('forgotten-heroes/ui/deck-expanded', 'true')
    localStorage.setItem(LANGUAGE_KEY, 'ja')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '「増水した渡し場」をプレイ' }))
    const encounter = screen.getByRole('region', { name: '遭遇' })
    expect(within(encounter).getByRole('heading', { name: '増水した渡し場' })).toBeTruthy()
    expect(within(encounter).getByText(/^雪解けで川は/)).toBeTruthy()
    expect(within(encounter).getByRole('button', { name: '「値切る」を選ぶ' })).toBeTruthy()
    expect(within(encounter).getByText(/^説得、DC 14/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(within(encounter).getByRole('heading', { name: 'The flooded ferry' })).toBeTruthy()
    expect(within(encounter).getByText(/^Spring melt has swollen/)).toBeTruthy()
  })
})
