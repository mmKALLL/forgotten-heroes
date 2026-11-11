export const formatModifier = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Never shows a possible outcome as 0% or a failable one as 100%. */
export function formatPercent(p: number): string {
  const rounded = Math.round(p * 100)
  if (rounded === 0 && p > 0) return '<1%'
  if (rounded === 100 && p < 1) return '>99%'
  return `${rounded}%`
}
