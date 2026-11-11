// One-off port of the prototype's English human names into data/original/names.json.
// Kept for provenance. Run: pnpm tsx scripts/port/port-names.ts
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const source = execFileSync(
  'git',
  ['show', 'v0.1.0-svelte-final:src/lib/generators/human-names-english.ts'],
  { encoding: 'utf8' }
)
const lists = new Map(
  [...source.matchAll(/var (nm\d+) = (\[[^\]]*\]);/g)].map((m) => [
    m[1],
    JSON.parse(m[2]) as string[],
  ])
)
const givenKeys = ['nm1', 'nm2', 'nm3', 'nm4', 'nm5', 'nm6', 'nm7', 'nm8', 'nm9', 'nm10']
const given = [...new Set(givenKeys.flatMap((k) => lists.get(k) ?? []))].sort()
const family = [...new Set(lists.get('nm11') ?? [])].sort()
if (given.length === 0 || family.length === 0)
  throw new Error('name lists not found in the tagged source')

const file = {
  $schema: '../_schema/names.schema.json',
  kind: 'names',
  source: 'original',
  notes: 'Ported from src/lib/generators/human-names-english.ts at tag v0.1.0-svelte-final.',
  entries: [{ id: 'human-english', ancestries: ['human', 'half-elf'], given, family }],
}
writeFileSync('data/original/names.json', JSON.stringify(file, null, 2) + '\n')
console.log(`wrote ${given.length} given and ${family.length} family names`)
