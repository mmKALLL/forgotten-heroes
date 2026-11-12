// Images from assets/ (gitignored, copied from ~/dnd5e by pnpm sync-assets). A missing file is
// simply not found, and the UI falls back: parchment instead of the map, no town banner.
const images: Record<string, string> = {
  ...import.meta.glob<string>('../../assets/world maps/*.{jpg,jpeg,png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  ...import.meta.glob<string>('../../assets/town maps/**/*.{jpg,jpeg,png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
}
const PREFIX = '../../assets/'

export const WORLD_MAP_IMAGE = 'world maps/altaeus map.jpg'

/** The URL of an image by its path under assets/ (e.g. "world maps/altaeus map.jpg"), or null. */
export function assetUrl(path: string): string | null {
  const key = PREFIX + path
  return Object.hasOwn(images, key) ? images[key] : null
}
