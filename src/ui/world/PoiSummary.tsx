import type { PoiInfo } from '../../engine/travel/preview'
import { useI18n } from '../i18n/I18n'
import { poiCategoryText } from './PoiGlyph'

/**
 * What a point of interest is: category and type, the domain and kingdom that own it, what it
 * does to the domain's threat, and a spring or well when it has one.
 */
export function PoiSummary({ info }: { info: PoiInfo }) {
  const { t } = useI18n()
  const category = poiCategoryText(t, info.category)
  return (
    <>
      <p className="small">
        {t('poi.kind', {
          category: category[0].toUpperCase() + category.slice(1),
          type: info.typeName,
        })}
      </p>
      <p className="muted small">
        {t('poi.owner', {
          land: info.landName,
          domain: info.domainName,
          kingdom: info.kingdomName,
        })}
      </p>
      {info.cleared ? (
        <p className="small tone-good">{t('poi.cleared')}</p>
      ) : (
        info.threat > 0 && (
          <p className="small tone-bad">
            {t('poi.feeds', { threat: info.threatName, n: info.threat })}
          </p>
        )
      )}
      {info.water && <p className="small">{t('poi.water')}</p>}
    </>
  )
}
