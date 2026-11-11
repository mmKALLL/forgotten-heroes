import { expect, test } from 'vitest'
import skillsJson from '../../data/original/skills.json'
import { SKILLS } from '../schema/constants'

test('data/original/skills.json defines exactly the skill ids in SKILLS', () => {
  const ids = skillsJson.entries.map((e) => e.id)
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
  const known = new Set<string>(SKILLS)
  const unknown = ids.filter((id) => !known.has(id))
  const missing = SKILLS.filter((id) => !ids.includes(id))
  const hint =
    'New skill ids must also be added to SKILLS in src/schema/constants.ts, ' +
    'and every id there needs exactly one entry in data/original/skills.json.'
  expect(duplicates, `duplicate skill ids: ${duplicates.join(', ')}. ${hint}`).toEqual([])
  expect(unknown, `skill ids not in SKILLS: ${unknown.join(', ')}. ${hint}`).toEqual([])
  expect(missing, `skills missing from skills.json: ${missing.join(', ')}. ${hint}`).toEqual([])
})
