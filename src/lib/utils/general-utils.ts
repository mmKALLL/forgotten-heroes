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

export const isDefined = <T>(val: T | undefined | null): val is T =>
  val !== null && val !== undefined

// Explicitly check that all inferred types are used
export function assertNever(x: never): never {
  throw new Error(`Unexpected object in assertNever:\n  ${x}`)
}
