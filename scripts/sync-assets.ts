// Copies the assets listed in assets.manifest.txt from the dnd5e folder into ./assets/.
// Run: pnpm sync-assets   (DND5E_DIR overrides the default ~/dnd5e)
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseManifest(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const path = normalize(line).replace(/\/+$/, '')
      if (isAbsolute(path) || path.startsWith('..')) {
        throw new Error(`manifest paths must be relative to the dnd5e folder: ${line}`)
      }
      return path
    })
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
    cpSync(source, join(toDir, path), { recursive: true })
    copied.push(path)
  }
  return { copied, missing }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const fromDir = process.env.DND5E_DIR ?? join(homedir(), 'dnd5e')
  const paths = parseManifest(readFileSync(join(root, 'assets.manifest.txt'), 'utf8'))
  const { copied, missing } = syncAssets(paths, fromDir, join(root, 'assets'))
  console.log(`copied ${copied.length} entries from ${fromDir}`)
  if (missing.length > 0) {
    console.error(`missing:\n${missing.map((m) => `  - ${m}`).join('\n')}`)
    process.exitCode = 1
  }
}
