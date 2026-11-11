import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { SCHEMA_DIR, renderSchema, schemaKinds } from './gen-schemas'

test.each(schemaKinds)('data/_schema/%s.schema.json is up to date (run pnpm schemas)', (kind) => {
  expect(readFileSync(`${SCHEMA_DIR}${kind}.schema.json`, 'utf8')).toBe(renderSchema(kind))
})
