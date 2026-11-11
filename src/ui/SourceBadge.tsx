import type { Source } from '../schema/common'

export const SOURCE_LABELS: Record<Source, string> = {
  original: 'Original',
  imported: 'SRD',
  'imported-private': 'Private',
  procedural: 'Procedural',
  claude: 'Claude',
}

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className={`badge source-${source}`} title={`Content source: data/${source}/`}>
      {SOURCE_LABELS[source]}
    </span>
  )
}
