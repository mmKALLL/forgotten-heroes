import { describe, expect, test } from 'vitest'
import { buildContent, byCodeUnit, sortedEntries } from './build'

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
    const { content, errors } = buildContent({
      '../../data/original/classes.json': classesFile('original'),
    })
    expect(errors).toEqual([])
    expect(content.classes.fighter).toMatchObject({
      name: 'Fighter',
      source: 'original',
      file: '../../data/original/classes.json',
    })
  })

  test('rejects unknown kinds', () => {
    const { errors } = buildContent({
      'data/original/x.json': { kind: 'spaceships', source: 'original', entries: [] },
    })
    expect(errors[0].message).toMatch(/unknown kind/)
  })

  test('rejects schema violations with a readable message', () => {
    const bad = { ...fighter, hitDie: 7 }
    const { errors } = buildContent({
      'data/original/classes.json': classesFile('original', [bad]),
    })
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

  test('prototype property names are not mistaken for kinds', () => {
    for (const kind of ['toString', '__proto__', 'constructor']) {
      let result: ReturnType<typeof buildContent> | undefined
      expect(() => {
        result = buildContent({ 'data/original/x.json': { kind, source: 'original', entries: [] } })
      }).not.toThrow()
      expect(result!.errors).toHaveLength(1)
      expect(result!.errors[0].message).toMatch(/unknown kind/)
    }
  })

  test('an entry id that names an Object.prototype property loads without a bogus duplicate', () => {
    const entry = { ...fighter, id: 'constructor' }
    const { content, errors } = buildContent({
      'data/original/classes.json': classesFile('original', [entry]),
    })
    expect(errors).toEqual([])
    expect(Object.hasOwn(content.classes, 'constructor')).toBe(true)
    expect(content.classes.constructor.name).toBe('Fighter')
  })
})

describe('encounter content kinds', () => {
  test('situations, archetypes, parts tables, templates and creatures load with their source', () => {
    const { content, errors } = buildContent({
      'data/claude/situations.json': {
        kind: 'situations',
        source: 'claude',
        entries: [
          { id: 'quiet-road', title: 'Quiet road', stages: { start: { text: 'Nothing stirs.' } } },
        ],
      },
      'data/claude/archetypes.json': {
        kind: 'archetypes',
        source: 'claude',
        entries: [
          {
            id: 'tiny',
            name: 'Tiny',
            description: 'One option',
            options: [{ id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'You go.' } }],
          },
        ],
      },
      'data/procedural/parts.json': {
        kind: 'partsTables',
        source: 'procedural',
        entries: [{ id: 'mood', description: 'Moods', rows: [{ text: 'grim' }] }],
      },
      'data/procedural/templates.json': {
        kind: 'situationTemplates',
        source: 'procedural',
        entries: [
          {
            id: 'grim-road',
            title: 'Grim road',
            text: 'A {mood} road.',
            slots: { mood: { from: 'table', table: 'mood' } },
            archetype: { id: 'tiny' },
          },
        ],
      },
      'data/imported/creatures.json': {
        kind: 'creatures',
        source: 'imported',
        entries: [
          {
            id: 'wolf',
            name: 'Wolf',
            group: 'a pack of wolves',
            type: 'beast',
            cr: 0.25,
            description: 'A hungry hunter.',
          },
        ],
      },
      'data/imported-private/situations.json': {
        kind: 'situations',
        source: 'imported-private',
        entries: [{ id: 'private-one', title: 'Private', stages: { start: { text: '…' } } }],
      },
    })
    expect(errors).toEqual([])
    expect(content.situations['quiet-road']).toMatchObject({
      source: 'claude',
      start: 'start',
      wonder: false,
    })
    expect(content.archetypes.tiny.options).toHaveLength(1)
    expect(content.partsTables.mood.rows[0]).toEqual({ text: 'grim', weight: 1 })
    expect(content.situationTemplates['grim-road'].archetype).toEqual({
      id: 'tiny',
      dc: 13,
      reward: 1,
    })
    expect(content.creatures.wolf.source).toBe('imported')
    expect(content.situations['private-one'].source).toBe('imported-private')
  })
})

describe('locale-independent ordering', () => {
  test('byCodeUnit compares by UTF-16 code unit', () => {
    expect(['z-x', 'aa-b', 'y-c', 'i-j'].sort(byCodeUnit)).toEqual(['aa-b', 'i-j', 'y-c', 'z-x'])
    // localeCompare would put lowercase before uppercase; code units put 'B' (0x42) first.
    expect(['b', 'a', 'B'].sort(byCodeUnit)).toEqual(['B', 'a', 'b'])
    expect(byCodeUnit('x', 'x')).toBe(0)
  })

  test('sortedEntries uses code-unit order, whatever the runtime locale', () => {
    const table = Object.fromEntries(['z-x', 'aa-b', 'y-c', 'i-j'].map((id) => [id, { id }]))
    expect(sortedEntries(table).map((e) => e.id)).toEqual(['aa-b', 'i-j', 'y-c', 'z-x'])
  })

  test('files are processed in code-unit path order, so the first duplicate wins deterministically', () => {
    const { content, errors } = buildContent({
      'data/original/z.json': classesFile('original'),
      'data/claude/aa.json': classesFile('claude'),
    })
    expect(content.classes.fighter.file).toBe('data/claude/aa.json')
    expect(errors[0].file).toBe('data/original/z.json')
  })
})

describe('translations', () => {
  const jaClasses = (overrides: Record<string, unknown> = {}) => ({
    kind: 'translations',
    source: 'claude',
    locale: 'ja',
    target: 'classes',
    entries: [{ id: 'fighter', fields: { name: 'ファイター' } }],
    ...overrides,
  })
  const withFighter = (files: Record<string, unknown>) =>
    buildContent({ 'data/original/classes.json': classesFile('original'), ...files })

  test('load from data/locales/<locale>/, keyed by locale, target and id', () => {
    const { content, errors } = withFighter({ 'data/locales/ja/classes.json': jaClasses() })
    expect(errors).toEqual([])
    expect(content.translations['ja/classes/fighter']).toMatchObject({
      fields: { name: 'ファイター' },
      locale: 'ja',
      target: 'classes',
      source: 'claude',
      file: 'data/locales/ja/classes.json',
    })
  })

  test('source is checked against the source list, not the folder', () => {
    const { errors } = withFighter({
      'data/locales/ja/classes.json': jaClasses({ source: 'nobody' }),
    })
    expect(errors[0].message).toMatch(/source/)
  })

  test("the file's locale must match its folder", () => {
    const { errors } = withFighter({ 'data/locales/fr/classes.json': jaClasses() })
    expect(errors[0].message).toMatch(/locale "ja" does not match folder data\/locales\/fr\//)
  })

  test('only translations belong in data/locales/, and translations only there', () => {
    const { errors } = withFighter({
      'data/locales/ja/x.json': classesFile('claude'),
      'data/claude/ja-classes.json': jaClasses(),
      'data/locales/loose.json': jaClasses(),
    })
    expect(errors.map((e) => e.file)).toEqual([
      'data/claude/ja-classes.json',
      'data/locales/ja/x.json',
      'data/locales/loose.json',
    ])
    expect(errors[0].message).toMatch(/must live in data\/locales\/<locale>\//)
    expect(errors[1].message).toMatch(/only translations belong in data\/locales\//)
    expect(errors[2].message).toMatch(/must live in data\/locales\/<locale>\//)
  })

  test('a translation must name an existing entry and existing text fields', () => {
    const { errors } = withFighter({
      'data/locales/ja/classes.json': jaClasses({
        entries: [
          { id: 'fighter', fields: { name: 'ファイター', title: '戦士', hitDie: '十' } },
          { id: 'jester', fields: { name: '道化' } },
        ],
      }),
    })
    expect(errors.map((e) => e.message)).toEqual([
      'ja translation of classes "fighter": "title" is not a text field',
      'ja translation of classes "fighter": "hitDie" is not a text field',
      'ja translation of unknown classes "jester"',
    ])
  })

  test('the same entry translated twice is a duplicate', () => {
    const { errors } = withFighter({
      'data/locales/ja/a.json': jaClasses(),
      'data/locales/ja/b.json': jaClasses(),
    })
    expect(errors[0].message).toMatch(/duplicate ja translation of classes "fighter"/)
  })
})
