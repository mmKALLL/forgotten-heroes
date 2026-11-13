// Images from assets/ (gitignored, copied from ~/dnd5e by pnpm sync-assets). A missing file is
// simply not found, and the UI falls back: parchment instead of the map, no town banner, a plain
// schematic instead of a dungeon's map.
const images: Record<string, string> = {
  ...import.meta.glob<string>('../../assets/world maps/*.{jpg,jpeg,png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  // Vite refuses file names with a colon (e.g. "elf:halfling village"): pnpm sync-assets copies
  // them with a hyphen instead, and copies made before that are skipped.
  ...import.meta.glob<string>(
    ['../../assets/town maps/**/*.{jpg,jpeg,png,webp}', '!../../assets/town maps/**/*:*'],
    { eager: true, query: '?url', import: 'default' }
  ),
  // The authored dungeons' maps (Plan 6 D4), under their manifest paths (colons made hyphens).
  ...import.meta.glob<string>(
    [
      '../../assets/tiles and battle maps/dungeon maps/**/*.{jpg,jpeg,png,webp}',
      '!../../assets/tiles and battle maps/dungeon maps/**/*:*',
    ],
    { eager: true, query: '?url', import: 'default' }
  ),
  // Map icons by game-icons.net id (CC BY 3.0), when synced; the map draws its own glyphs otherwise.
  ...import.meta.glob<string>('../../assets/icons/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
}
const PREFIX = '../../assets/'

export const WORLD_MAP_IMAGE = 'world maps/altaeus map.jpg'

/**
 * The URL of an image by its path under assets/ (e.g. "world maps/altaeus map.jpg"), or null. A
 * colon in the path reads as a hyphen, as pnpm sync-assets copies it (Vite refuses colons).
 */
export function assetUrl(path: string): string | null {
  const key = PREFIX + path.replaceAll(':', '-')
  return Object.hasOwn(images, key) ? images[key] : null
}

/** A synced map icon (assets/icons/<id>.svg, a game-icons.net id), or null. */
export const iconUrl = (id: string | undefined): string | null =>
  id ? assetUrl(`icons/${id}.svg`) : null
