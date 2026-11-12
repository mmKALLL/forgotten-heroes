import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { placeInfo, suppliesInfo } from '../../engine/travel/preview'
import { FOOD_PRICE, goodsOf, restOption, saleValue } from '../../engine/travel/supplies'
import { WATERSKIN_PRICE, WATERSKIN_WATER } from '../../engine/travel/tuning'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { useI18n } from '../i18n/I18n'
import { ExploreAction } from './ExploreAction'
import { RoadsOut } from './RoadsOut'
import { realmText, sizeText, threatLine } from './travelText'
import type { TravelPrefs } from './travelPrefs'

/** Rations bought or sold per click. */
export const RATION_BUNDLE = 5

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (placeId: string | null) => void
  /** The pace and foraging chosen for the roads out (kept by the caller across journeys). */
  prefs: TravelPrefs
  onPrefs: (p: TravelPrefs) => void
  onAction: (a: Action) => void
}

/**
 * The settlement the party is in (a placeholder until the Plan 4 ledger): type, realm, threat,
 * services and banner; rest, food, waterskins and selling supplies; exploring the domain; and the
 * roads and paths out, with the pace chooser and everything the chosen road and pace cost and risk.
 */
export function PlacePanel({
  content,
  state,
  selected,
  onSelect,
  prefs,
  onPrefs,
  onAction,
}: Props) {
  const { t } = useI18n()
  const here = state.location ? placeInfo(state, content, state.location) : null
  if (!here) {
    return (
      <section className="panel place" aria-label={t('place.heading')}>
        <p>{t('place.nowhere')}</p>
      </section>
    )
  }
  const banner = here.banner ? assetUrl(here.banner) : null
  const supplies = suppliesInfo(state)
  const rest = restOption(state)
  const food = goodsOf(state.goods, 'food')
  const sellFood = Math.min(RATION_BUNDLE, food)
  return (
    <section className="panel place" aria-label={t('place.heading')}>
      {banner && (
        <img className="banner" src={banner} alt={t('place.banner', { name: here.name })} />
      )}
      <h2>{here.name}</h2>
      <p className="small" title={t('place.size', { size: sizeText(t, here.sizeTier) })}>
        {t('place.summary', { type: here.typeName, population: here.population })}
      </p>
      <p className="muted small">{realmText(t, here)}</p>
      <p className="small">{threatLine(t, here)}</p>
      <h3>{t('place.services')}</h3>
      {here.services.length > 0 ? (
        <ul className="services">
          {here.services.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('place.noServices')}</p>
      )}
      <h3>{t('place.supplies')}</h3>
      <p className="small">
        {t('place.carried', {
          food: supplies.food,
          water: supplies.water,
          capacity: supplies.waterCapacity,
          skins: state.waterskins,
        })}
      </p>
      <div className="actions" title={t('place.restHint')}>
        {rest.lodging ? (
          <>
            <button onClick={() => onAction({ type: 'rest' })}>
              {t('place.restInn', { gp: rest.lodgingCost })}
            </button>
            <button onClick={() => onAction({ type: 'rest', lodging: false })}>
              {t('place.restOwn')}
            </button>
          </>
        ) : (
          <button onClick={() => onAction({ type: 'rest', lodging: false })}>
            {t('place.restOwn')}
          </button>
        )}
      </div>
      <div className="actions">
        <button
          disabled={state.gold < FOOD_PRICE}
          onClick={() => onAction({ type: 'buyFood', amount: RATION_BUNDLE })}
        >
          {t('place.buyFood', { n: RATION_BUNDLE, gp: RATION_BUNDLE * FOOD_PRICE })}
        </button>
        <button
          disabled={state.gold < WATERSKIN_PRICE}
          onClick={() => onAction({ type: 'buyWaterskin', count: 1 })}
        >
          {t('place.buyWaterskin', { gp: WATERSKIN_PRICE, water: WATERSKIN_WATER })}
        </button>
        {sellFood > 0 && (
          <button onClick={() => onAction({ type: 'sellSupplies', food: sellFood })}>
            {t('place.sellFood', { n: sellFood, gp: saleValue(sellFood, 0) })}
          </button>
        )}
        {state.waterskins > 0 && (
          <button onClick={() => onAction({ type: 'sellSupplies', waterskins: 1 })}>
            {t('place.sellWaterskin', { gp: saleValue(0, 1) })}
          </button>
        )}
      </div>
      <ExploreAction content={content} state={state} onAction={onAction} />
      <RoadsOut
        content={content}
        state={state}
        selected={selected}
        onSelect={onSelect}
        prefs={prefs}
        onPrefs={onPrefs}
        onAction={onAction}
      />
    </section>
  )
}
