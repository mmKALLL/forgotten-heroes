// Mulberry32: a small, fast, seedable PRNG. Its whole state is one uint32, so it serialises trivially.
export type Rng = { readonly state: number }

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 }
}

export function nextFloat(rng: Rng): [number, Rng] {
  const state = (rng.state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, { state }]
}

export interface Draw {
  float(): number
  /** Integer in [min, max], inclusive on both ends. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  weighted<T>(items: readonly T[], weight: (item: T) => number): T
}

/**
 * Run several draws with a local cursor and get the advanced RNG back.
 * The mutation stays inside this call, so callers remain pure.
 */
export function withRng<T>(rng: Rng, fn: (draw: Draw) => T): [T, Rng] {
  let current = rng
  const float = () => {
    const [value, next] = nextFloat(current)
    current = next
    return value
  }
  const int = (min: number, max: number) => min + Math.floor(float() * (max - min + 1))
  const pickOne = <U>(items: readonly U[]): U => {
    if (items.length === 0) throw new Error('cannot pick from an empty list')
    return items[int(0, items.length - 1)]
  }
  const weighted = <U>(items: readonly U[], weight: (item: U) => number): U => {
    const positive = items.filter((item) => weight(item) > 0)
    if (positive.length === 0) throw new Error('cannot pick from an empty or zero-weight list')
    const total = positive.reduce((sum, item) => sum + weight(item), 0)
    let remaining = float() * total
    for (const item of positive) {
      remaining -= weight(item)
      if (remaining < 0) return item
    }
    return positive[positive.length - 1]
  }
  const result = fn({ float, int, pick: pickOne, weighted })
  return [result, current]
}

export const nextInt = (rng: Rng, min: number, max: number) => withRng(rng, (d) => d.int(min, max))

export const pick = <T>(rng: Rng, items: readonly T[]) => withRng(rng, (d) => d.pick(items))
