// One-off port of the prototype's place-name parts into data/original/place-names.json.
// Kept for provenance. Run: pnpm tsx scripts/port/port-place-names.ts
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const source = execFileSync('git', ['show', 'v0.1.0-svelte-final:src/lib/generators/towns.ts'], {
  encoding: 'utf8',
})
const lists = new Map(
  [...source.matchAll(/var (nm\d+) = (\[[^\]]*\]);/g)].map((m) => [
    m[1],
    JSON.parse(m[2]) as string[],
  ])
)
const get = (key: string): string[] => {
  const list = lists.get(key)
  if (!list || list.length === 0) throw new Error(`${key} not found in the tagged source`)
  return list
}
const unique = (items: string[]) => [...new Set(items)]

// The prototype paired French prefixes 6–27 only with suffixes from index 21 on (nameGen(1)).
// Two tables keep that rule as data. Their weights split the French share by prefix count.
const nm25 = get('nm25')
const nm26 = get('nm26')
const entries = [
  {
    id: 'english-compound',
    style: 'english',
    weight: 2,
    first: unique(get('nm1')),
    second: unique(get('nm2')),
  },
  {
    id: 'french-soft',
    style: 'french',
    weight: 0.3,
    first: unique(nm25.slice(6, 28)),
    second: unique(nm26.slice(21)),
  },
  {
    id: 'french',
    style: 'french',
    weight: 0.7,
    first: unique([...nm25.slice(0, 6), ...nm25.slice(28)]),
    second: unique(nm26),
  },
  {
    id: 'spanish',
    style: 'spanish',
    weight: 1,
    first: unique(get('nm7')),
    second: unique(get('nm8')),
  },
]

const file = {
  $schema: '../_schema/placeNames.schema.json',
  kind: 'placeNames',
  source: 'original',
  notes:
    'Ported from src/lib/generators/towns.ts at tag v0.1.0-svelte-final by scripts/port/port-place-names.ts. A name is a first part plus a second part. The prototype paired French prefixes 6–27 only with suffixes 21 onwards; french-soft keeps that pairing. Weights are new.',
  entries,
}
writeFileSync('data/original/place-names.json', JSON.stringify(file, null, 2) + '\n')
console.log(entries.map((e) => `${e.id}: ${e.first.length} × ${e.second.length}`).join('\n'))
