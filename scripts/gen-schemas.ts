// Generates JSON Schemas from the zod content schemas, for editor autocompletion.
// Run: pnpm schemas
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { CONTENT_KINDS, fileSchemaFor, type ContentKind } from '../src/schema/content'

export const SCHEMA_DIR = fileURLToPath(new URL('../data/_schema/', import.meta.url))
export const schemaKinds = Object.keys(CONTENT_KINDS) as ContentKind[]

export function renderSchema(kind: ContentKind): string {
  // io: 'input' keeps fields with defaults optional for people editing by hand.
  // reused: 'ref' moves repeated shapes (options, outcomes, effects) into $defs, keeping files small.
  const schema = z.toJSONSchema(fileSchemaFor(kind), { io: 'input', reused: 'ref' })
  return JSON.stringify(schema, null, 2) + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(SCHEMA_DIR, { recursive: true })
  for (const kind of schemaKinds)
    writeFileSync(`${SCHEMA_DIR}${kind}.schema.json`, renderSchema(kind))
  console.log(`wrote ${schemaKinds.length} schemas to data/_schema/`)
}
