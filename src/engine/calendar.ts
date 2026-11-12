export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const
export type Season = (typeof SEASONS)[number]
export const DAYS_PER_SEASON = 90

export const seasonOf = (day: number): Season =>
  SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % SEASONS.length]

/** "Day 91 · Summer 1, year 1". Day 1 is the first day of spring in year 1. */
export function formatDate(day: number): string {
  const index = day - 1
  const year = Math.floor(index / (DAYS_PER_SEASON * SEASONS.length)) + 1
  return `Day ${day} · ${seasonOf(day)} ${(index % DAYS_PER_SEASON) + 1}, year ${year}`
}
