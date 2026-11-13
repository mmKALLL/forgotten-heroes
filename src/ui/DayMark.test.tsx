// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { dangerInfo } from '../engine/world/danger'
import { DayMark } from './DayMark'

afterEach(cleanup)

test('the day names the danger in its tooltip, and marks it once it has risen', () => {
  render(<DayMark day={1} />)
  expect(screen.queryByText(/⚠/)).toBeNull()
  expect(screen.getByRole('tooltip', { hidden: true }).textContent).toContain(
    dangerInfo({ day: 1, crisis: null }).text
  )
  cleanup()

  // Find a day with danger, without pinning the ramp's step.
  const on = (day: number) => dangerInfo({ day, crisis: null })
  const day = Array.from({ length: 600 }, (_, i) => i + 1).find((d) => on(d).percent > 0)!
  const danger = on(day)
  render(<DayMark day={day} />)
  expect(screen.getByText(`⚠ +${danger.percent}%`)).toBeTruthy()
  const tip = screen.getByRole('tooltip', { hidden: true }).textContent
  expect(tip).toContain(danger.text)
  expect(tip).toContain(`next rise on day ${danger.nextDay}`)
})
