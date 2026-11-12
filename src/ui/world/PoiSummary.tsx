import type { PoiInfo } from '../../engine/travel/preview'
import { useI18n } from '../i18n/I18n'
import { poiCategoryText } from './PoiGlyph'
import { daysText } from './travelText'

/**
 * What a point of interest is: category and type, the domain and kingdom that own it, what it
 * does to the domain's threat, where a dungeon or lair is in its cycle (empty, re-inhabited,
 * growing stronger), and a spring or well when it has one.
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
      {info.status?.phase === 'empty' ? (
        <p className="small tone-good">
          {info.status.days === 0
            ? t('poi.clearedToday')
            : t('poi.clearedAgo', { days: daysText(t, info.status.days) })}
        </p>
      ) : (
        <>
          {info.status?.reinhabited && <p className="small tone-bad">{t('poi.reinhabited')}</p>}
          {info.dcBonus > 0 && (
            <p className="small tone-bad">{t('poi.stronger', { dc: info.dcBonus })}</p>
          )}
          {info.threat > 0 && (
            <p className="small tone-bad">
              {info.feedsLandThreat
                ? t('poi.feeds', { threat: info.threatName, n: info.threat })
                : t('poi.addsThreat', { n: info.threat })}
            </p>
          )}
        </>
      )}
      {info.water && <p className="small">{t('poi.water')}</p>}
    </>
  )
}
