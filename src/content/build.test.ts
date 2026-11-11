import { describe, expect, test } from 'vitest'
import { buildContent } from './build'

const fighter = {
  id: 'fighter',
  name: 'Fighter',
  hitDie: 10,
  baseAbilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
  skillProficiencies: ['athletics'],
}
const classesFile = (source: string, entries: unknown[] = [fighter]) => ({
  kind: 'classes',
  source,
  entries,
})

describe('buildContent', () => {
  test('loads valid entries and tags them with source and file', () => {
    const { content, errors } = buildContent({ '../../data/original/classes.json': classesFile('original') })
    expect(errors).toEqual([])
    expect(content.classes.fighter).toMatchObject({
      name: 'Fighter',
      source: 'original',
      file: '../../data/original/classes.json',
    })
  })

  test('rejects unknown kinds', () => {
    const { errors } = buildContent({ 'data/original/x.json': { kind: 'spaceships', source: 'original', entries: [] } })
    expect(errors[0].message).toMatch(/unknown kind/)
  })

  test('rejects schema violations with a readable message', () => {
    const bad = { ...fighter, hitDie: 7 }
    const { errors } = buildContent({ 'data/original/classes.json': classesFile('original', [bad]) })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/hitDie/)
  })

  test('source must match the folder', () => {
    const { errors } = buildContent({ 'data/claude/classes.json': classesFile('original') })
    expect(errors[0].message).toMatch(/does not match folder/)
  })

  test('duplicate ids across files are errors', () => {
    const { errors } = buildContent({
      'data/original/classes.json': classesFile('original'),
      'data/claude/classes.json': classesFile('claude'),
    })
    expect(errors[0].message).toMatch(/duplicate classes id "fighter"/)
  })

  test('files outside data/<source>/ are errors; _schema is skipped', () => {
    const { errors } = buildContent({
      'elsewhere/classes.json': classesFile('original'),
      'data/_schema/classes.schema.json': { anything: true },
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toBe('elsewhere/classes.json')
  })
})
