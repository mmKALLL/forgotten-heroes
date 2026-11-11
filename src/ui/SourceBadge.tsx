import { useI18n } from './i18n/I18n'
import type { Source } from '../schema/common'

export function SourceBadge({ source }: { source: Source }) {
  const { t } = useI18n()
  return (
    <span className={`badge source-${source}`} title={t('source.hint', { source })}>
      {t(`source.${source}`)}
    </span>
  )
}
