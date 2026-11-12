// Copies the assets listed in assets.manifest.txt, and in the gitignored
// assets.manifest.private.txt when it exists, from the dnd5e folder into ./assets/.
// The private manifest holds the paths whose names must stay out of git (the town maps named in
// data/imported-private/towns.json).
// Run: pnpm sync-assets   (DND5E_DIR overrides the default ~/dnd5e)
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The committed manifest, and the gitignored one for paths with private names. */
export const MANIFEST = 'assets.manifest.txt'
export const PRIVATE_MANIFEST = 'assets.manifest.private.txt'

export function parseManifest(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const path = normalize(line).replace(/\/+$/, '')
      // Reject the whole folder ('.', './', 'a/..') and any parent segment, but allow '..foo'.
      const escapes = path === '.' || path === '' || path.split(/[\\/]/).includes('..')
      if (isAbsolute(path) || escapes) {
        throw new Error(`manifest paths must be relative to the dnd5e folder: ${line}`)
      }
      return path
    })
}

/** Every path in the manifests under `root`: the committed one, then the private one if present. */
export function readManifests(root: string): string[] {
  const paths = parseManifest(readFileSync(join(root, MANIFEST), 'utf8'))
  const privatePath = join(root, PRIVATE_MANIFEST)
  if (existsSync(privatePath)) paths.push(...parseManifest(readFileSync(privatePath, 'utf8')))
  return [...new Set(paths)]
}

export function syncAssets(paths: string[], fromDir: string, toDir: string) {
  const copied: string[] = []
  const missing: string[] = []
  for (const path of paths) {
    const source = join(fromDir, path)
    if (!existsSync(source)) {
      missing.push(path)
      continue
    }
    cpSync(source, join(toDir, path), { recursive: true, dereference: true })
    copied.push(path)
  }
  return { copied, missing }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const fromDir = process.env.DND5E_DIR ?? join(homedir(), 'dnd5e')
  const paths = readManifests(root)
  const { copied, missing } = syncAssets(paths, fromDir, join(root, 'assets'))
  console.log(`copied ${copied.length} entries from ${fromDir}`)
  if (missing.length > 0) {
    console.error(`missing:\n${missing.map((m) => `  - ${m}`).join('\n')}`)
    process.exitCode = 1
  }
}
