// Pure helpers for scripts/port/port-town-maps.ts: town-map filenames → towns entries.
import type { Alignment, Biome, SizeTier } from '../../src/schema/constants'
import type { Town } from '../../src/schema/world'

export type TownMapFile = { name: string; description: string; alignment?: Alignment; file: string }

const IMAGE = /\.(jpe?g|png|webp)$/i
const OTHER_EXTENSION = /\.[a-z0-9]{2,4}$/i
const ALIGNMENT = /\b(LG|NG|CG|LN|TN|N|CN|LE|NE|CE)\b/g

/** "Corso - poor seaside capital - CN.jpg" → its parts. Null when the file isn't in the pattern. */
export function parseTownMapFilename(file: string): TownMapFile | null {
  const base = file.replace(IMAGE, '')
  if (OTHER_EXTENSION.test(base)) return null
  const parts = base.split(' - ').map((p) => p.trim())
  if (parts.length < 2 || !parts[0] || !parts[1]) return null
  const last = parts.length >= 3 ? parts[parts.length - 1] : ''
  const codes = [...last.matchAll(ALIGNMENT)].map((m) => (m[1] === 'N' ? 'TN' : m[1]) as Alignment)
  const description = (parts.length >= 3 ? parts.slice(1, -1) : parts.slice(1)).join(' - ')
  return { name: parts[0], description, alignment: codes.at(-1), file }
}

/** The first match wins, so larger sizes come first ("forest village stronghold" is a village). */
const SIZES: [RegExp, SizeTier][] = [
  [/\b(capital|capitol)\b/, 'metropolis'],
  [/\bcity\b/, 'city'],
  [/\btown\b/, 'town'],
  [/\bvillage\b/, 'village'],
  [/\b(hamlet|thorp|castle|stronghold)\b/, 'hamlet'],
  [/\bencampment\b/, 'outpost'],
]
const BIOME_WORDS: [RegExp, Biome][] = [
  [/\b(forest|foresty|wood|woods|treetop)\b/, 'forest'],
  [/\b(desert|arid)\b/, 'desert'],
  [/\b(swamp|marsh)\b/, 'marsh'],
  [/\bmountain\b/, 'mountains'],
  [/\b(cliff|cliffside|cliffy|hilly|hillsy|hills)\b/, 'hills'],
  [/\b(temperate|plains|river|riverside|valley)\b/, 'plains'],
  [/\b(tropical|jungle)\b/, 'jungle'],
]
const COASTAL = /\b(seaside|coastal|port|harbor|harbour|island|beach)\b/
const WEALTH: [RegExp, number][] = [
  [/\b(rich|prosperous)\b/, 2],
  [/\bpoor\b/, -2],
  [/\b(struggling|declining)\b/, -1],
]
/** half-elf comes before elf: "half-elf" contains the word "elf". */
const ANCESTRIES: [RegExp, string][] = [
  [/\bhalf-elf\b/, 'half-elf'],
  [/\b(elf|elven|drow)\b/, 'elf'],
  [/\bdwarf\b/, 'dwarf'],
  [/\b(hobgoblin|goblin)\b/, 'goblin'],
  [/\borc\b/, 'orc'],
]
/** Not a living settlement: under the sea or the ground, abandoned, ruined or wild. */
const SKIP = /\b(underwater|underdark|abandoned|ruins|wilderness|dungeon)\b/

export const kebab = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A towns entry, or null for files that don't describe a living settlement. */
export function townEntry(parsed: TownMapFile, folder: string, altaeus: boolean): Town | null {
  const description = parsed.description.toLowerCase()
  const all = `${parsed.name} ${parsed.description}`.toLowerCase()
  if (SKIP.test(all)) return null
  const size = SIZES.find(([re]) => re.test(description))?.[1]
  if (!size) return null
  const wealth = WEALTH.filter(([re]) => re.test(description)).reduce((sum, [, w]) => sum + w, 0)
  const town: Town = {
    id: kebab(parsed.name),
    name: parsed.name,
    description: parsed.description,
    alignment: parsed.alignment,
    size,
    capital: /\b(capital|capitol)\b/.test(description),
    biomes: BIOME_WORDS.filter(([re]) => re.test(description)).map(([, biome]) => biome),
    coastal: COASTAL.test(all),
    wealth: Math.max(-3, Math.min(3, wealth)),
    ancestry: ANCESTRIES.find(([re]) => re.test(description))?.[1],
    banner: `${folder}/${parsed.file}`,
    altaeus,
  }
  // Leave out the optional fields that are unset, so the JSON stays tidy.
  return Object.fromEntries(Object.entries(town).filter(([, v]) => v !== undefined)) as Town
}

/** One town per id: the first folder wins, then the first file in sorted order. Sorted by id. */
export function collectTowns(
  folders: { folder: string; altaeus: boolean; files: string[] }[]
): Town[] {
  const towns = new Map<string, Town>()
  for (const { folder, altaeus, files } of folders) {
    for (const file of [...files].sort()) {
      const parsed = parseTownMapFilename(file)
      const town = parsed && townEntry(parsed, folder, altaeus)
      if (town && !towns.has(town.id)) towns.set(town.id, town)
    }
  }
  return [...towns.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Town names taken from published settings, books, games or the real world (design §6). They go
 * in the gitignored data/imported-private/towns.json; everything else is committed. Generic
 * English place names that exist in many places (Kingston, Riverton) count as generic.
 */
export const PUBLISHED_TOWNS: ReadonlySet<string> = new Set([
  'absalom', // Pathfinder (Golarion)
  'athens', // the real world
  'barovia', // Ravenloft
  'brindol', // D&D, Red Hand of Doom
  'emon', // Critical Role (Exandria)
  'fallcrest', // D&D 4e, the Nentir Vale
  'gondolin', // Tolkien
  'kir-sabal', // D&D, Tomb of Annihilation
  'menzoberranzan', // Forgotten Realms
  'moria', // Tolkien
  'mos-onjar', // Star Wars style "Mos" town (guess)
  'mos-shuuta', // Star Wars: Edge of the Empire
  'mytros', // D&D, Odyssey of the Dragonlords
  'neverwinter', // Forgotten Realms
  'omu', // D&D, Tomb of Annihilation
  'phandalin', // Forgotten Realms, Lost Mine of Phandelver
  'port-nyanzaru', // D&D, Tomb of Annihilation
  'rabanstre', // Final Fantasy XII (Rabanastre)
  'red-larch', // Forgotten Realms, Princes of the Apocalypse
  'redwall', // Brian Jacques' Redwall
  'rivendell', // Tolkien
  'skullport', // Forgotten Realms
  'waterdeep', // Forgotten Realms
])

/** Splits towns into the committed (original) and the private (imported) lists. */
export function splitTowns(towns: Town[]): { original: Town[]; imported: Town[] } {
  return {
    original: towns.filter((t) => !PUBLISHED_TOWNS.has(t.id)),
    imported: towns.filter((t) => PUBLISHED_TOWNS.has(t.id)),
  }
}
