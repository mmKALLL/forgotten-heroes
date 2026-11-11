import { buildContent, type Content } from './build'

/** Every JSON file under data/, keyed by path. Private imports are included when present locally. */
export const bundledFiles: Record<string, unknown> = import.meta.glob(
  ['../../data/**/*.json', '!../../data/_schema/**'],
  { eager: true, import: 'default' }
)

export function loadBundledContent(): Content {
  const { content, errors } = buildContent(bundledFiles)
  if (errors.length > 0) {
    throw new Error(
      'Invalid content:\n' + errors.map((e) => `- ${e.file}: ${e.message}`).join('\n')
    )
  }
  return content
}
