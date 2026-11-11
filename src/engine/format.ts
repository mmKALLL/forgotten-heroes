export const formatModifier = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

export const formatPercent = (p: number): string => `${Math.round(p * 100)}%`
