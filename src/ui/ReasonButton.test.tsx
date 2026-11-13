// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { NOT_ENOUGH_GOLD } from '../engine/town/services'
import { ReasonButton } from './ReasonButton'

afterEach(cleanup)

test('"not enough gold" is announced and in the tooltip, but not shown inline; other reasons are', () => {
  render(
    <ReasonButton available={false} reason={NOT_ENOUGH_GOLD} onClick={() => {}}>
      Buy
    </ReasonButton>
  )
  const buy = screen.getByRole('button', { name: 'Buy' })
  expect(buy.title).toBe(NOT_ENOUGH_GOLD)
  expect(buy.getAttribute('aria-describedby')).toBeTruthy()
  expect(screen.getByText(NOT_ENOUGH_GOLD).className).toBe('sr-only')
  cleanup()
  render(
    <ReasonButton available={false} reason="the party is full" onClick={() => {}}>
      Hire
    </ReasonButton>
  )
  expect(screen.getByText('the party is full').className).toContain('service-why')
})
