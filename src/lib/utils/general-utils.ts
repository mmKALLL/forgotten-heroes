import type { Duration, Position } from '../types'

export function sum(a: number, b: number): number {
  return a + b
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(value, min))
}

export function getRandomValue<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getRandomWeightedValue<T>(arr: (T & { ratio: number })[]) {
  const total = arr.reduce((acc, cur) => acc + cur.ratio, 0)
  let value = Math.random() * total
  let index = 0
  while (value > 0) {
    value -= arr[index].ratio
    index++
  }
  return arr[index - 1]
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

export function capitalize(text: string) {
  return text.slice(0, 1).toLocaleUpperCase().concat(text.slice(1))
}

export function outputDuration(duration: Duration): string {
  return (
    Object.entries(duration)
      .map(([k, v]) => `${v} ${v === 1 ? k.slice(0, -1) : k}`)
      .join(', ') || 'unknown duration'
  )
}

export const isDefined = <T>(val: T | undefined | null): val is T =>
  val !== null && val !== undefined

// Explicitly check that all inferred types are used
export function assertNever(x: never): never {
  throw new Error(`Unexpected object in assertNever:\n  ${x}`)
}

// From T pick a set of properties K
export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const ret: any = {}
  keys.forEach((key) => {
    ret[key] = obj[key]
  })
  return ret
}

export function distance(origin: Position, destination: Position): number {
  return Math.round(
    Math.sqrt(Math.pow(origin.x - destination.x, 2) + Math.pow(origin.y - destination.y, 2))
  )
}
