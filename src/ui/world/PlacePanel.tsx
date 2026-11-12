import { useState } from 'react'
import type { Content } from '../../content/build'
import { formatModifier, formatPercent } from '../../engine/format'
import { tierFaces } from '../../engine/rules/checks'
import type { Action } from '../../engine/state'
import {
  placeInfo,
  routeOptions,
  suppliesInfo,
  type PaceOption,
  type RouteOption,
} from '../../engine/travel/preview'
import { FOOD_PRICE, goodsOf, restOption, saleValue } from '../../engine/travel/supplies'
import { WATERSKIN_PRICE, WATERSKIN_WATER } from '../../engine/travel/tuning'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { useI18n } from '../i18n/I18n'
import { OddsBar } from '../OddsBar'
import {
  biomeText,
  dangerText,
  daysText,
  paceChoiceOf,
  paceFields,
  threatText,
  warningMessage,
  type PaceChoice,
} from './travelText'

/** Rations bought or sold per click. */
export const RATION_BUNDLE = 5

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (settlementId: string | null) => void
  onAction: (a: Action) => void
}

/**
 * The settlement the party is in (a placeholder until the Plan 4 ledger): type, realm, threat,
 * services and banner; rest, food, waterskins and selling supplies; and the roads out, with the
 * pace chooser and everything the chosen road and pace cost and risk.
 */
export function PlacePanel({ content, state, selected, onSelect, onAction }: Props) {
  const { t } = useI18n()
  const [pace, setPace] = useState<PaceChoice>('steady')
  const [forage, setForage] = useState(true)
  const here = state.location ? placeInfo(state, content, state.location) : null
  if (!here) {
    return (
      <section className="panel place" aria-label={t('place.heading')}>
        <p>{t('place.nowhere')}</p>
      </section>
    )
  }
  const roads = routeOptions(state, content, forage)
  const chosen = roads.find((r) => r.to === selected) ?? null
  const elsewhere =
    selected && !chosen && selected !== state.location ? placeInfo(state, content, selected) : null
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
      <p className="small">
        {t('place.summary', {
          type: here.typeName,
          size: here.sizeLabel,
          population: here.population,
        })}
        {here.seat && ` · ${t('place.seat')}`}
      </p>
      <p className="muted small">
        {t('place.realm', {
          region: here.regionName,
          kingdom: here.kingdomName,
          ancestry: here.rulerAncestry,
        })}
      </p>
      <p className="small">
        {t('place.threat', { threat: here.threatName, level: threatText(t, here.threatLevel) })}
      </p>
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
      <h3>{t('place.roads')}</h3>
      <ul className="road-list" aria-label={t('place.roads')}>
        {roads.map((r) => (
          <li key={r.routeId}>
            <button aria-pressed={r.to === selected} onClick={() => onSelect(r.to)}>
              {r.toName}
            </button>{' '}
            <span className="muted small">
              {t('route.summary', {
                km: r.km,
                days: r.days,
                terrain: biomeText(t, r.terrain),
                danger: dangerText(t, r.danger),
              })}
            </span>
          </li>
        ))}
      </ul>
      {chosen && (
        <RouteInfo
          road={chosen}
          state={state}
          content={content}
          pace={pace}
          onPace={setPace}
          forage={forage}
          onForage={setForage}
          onTravel={(stowaway) => {
            const choice = chosen.terrain === 'sea' ? 'steady' : pace
            onAction({
              type: 'travel',
              routeId: chosen.routeId,
              ...paceFields(choice),
              forage,
              ...(stowaway ? { stowaway: true } : {}),
            })
            onSelect(null)
          }}
        />
      )}
      {elsewhere && (
        <div className="route-info">
          <p className="small">
            {t('place.elsewhere', {
              name: elsewhere.name,
              type: elsewhere.typeName,
              region: elsewhere.regionName,
              kingdom: elsewhere.kingdomName,
            })}{' '}
            ·{' '}
            {t('place.threat', {
              threat: elsewhere.threatName,
              level: threatText(t, elsewhere.threatLevel),
            })}
          </p>
          <p className="muted small">{t('route.unreachable', { name: elsewhere.name })}</p>
        </div>
      )}
    </section>
  )
}

/** Everything about one road at the chosen pace before the party commits (input randomness). */
function RouteInfo({
  road,
  state,
  content,
  pace,
  onPace,
  forage,
  onForage,
  onTravel,
}: {
  road: RouteOption
  state: GameState
  content: Content
  pace: PaceChoice
  onPace: (p: PaceChoice) => void
  forage: boolean
  onForage: (f: boolean) => void
  onTravel: (stowaway: boolean) => void
}) {
  const { t, stat } = useI18n()
  const there = placeInfo(state, content, road.to)
  const sea = road.terrain === 'sea'
  const option: PaceOption =
    road.paces.find((p) => paceChoiceOf(p) === pace) ??
    road.paces.find((p) => p.pace === 'steady') ??
    road.paces[0]
  const shown = paceChoiceOf(option)
  const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
  const round = (n: number) => Math.ceil(n - 1e-9)
  return (
    <div className="route-info" role="group" aria-label={t('route.heading', { name: road.toName })}>
      <h3>{t('route.heading', { name: road.toName })}</h3>
      {there && (
        <p className="small">
          {there.typeName} · {there.regionName} · {there.kingdomName} ·{' '}
          {t('place.threat', { threat: there.threatName, level: threatText(t, there.threatLevel) })}
        </p>
      )}
      <div className="seg-toggle pace-choice" role="group" aria-label={t('route.pace')}>
        {road.paces.map((p) => {
          const choice = paceChoiceOf(p)
          return (
            <button
              key={choice}
              aria-pressed={choice === shown}
              title={t(`paceHint.${choice}`)}
              onClick={() => onPace(choice)}
            >
              {t(`pace.${choice}`)}
            </button>
          )
        })}
      </div>
      {sea ? (
        <p className="muted small">{t('route.seaPace')}</p>
      ) : (
        <>
          <p className="muted small">{t(`paceHint.${shown}`)}</p>
          <label className="inline small">
            <input type="checkbox" checked={forage} onChange={(e) => onForage(e.target.checked)} />{' '}
            {t('route.forage')}
          </label>
        </>
      )}
      {option.warnings.length > 0 && (
        <ul className="warnings" aria-label={t('route.warnings')}>
          {option.warnings.map((w) => (
            <li key={w.code}>⚠ {warningMessage(t, w)}</li>
          ))}
        </ul>
      )}
      <ul className="route-facts small">
        <li>{t('route.days', { days: daysText(t, option.days) })}</li>
        <li>
          {t('route.food', { needed: round(option.food.needed), carried: option.food.carried })}
          {option.food.expectedForage > 0 &&
            t('route.foraging', { n: option.food.expectedForage.toFixed(1) })}
        </li>
        <li>
          {t('route.water', {
            needed: round(option.water.needed),
            carried: option.water.carried,
            capacity: option.water.capacity,
          })}
          {option.water.expectedForage > 0 &&
            t('route.foraging', { n: option.water.expectedForage.toFixed(1) })}
        </li>
        <li>
          {t('route.encounters', {
            min: option.encounters[0],
            max: option.encounters[1],
            chance: formatPercent(option.chance),
          })}
        </li>
        {option.hostileAvoided > 0 && (
          <li>{t('route.avoids', { pct: formatPercent(option.hostileAvoided) })}</li>
        )}
        <li>{t('route.footing', { footing: t(`footing.${option.ambush}`) })}</li>
        {road.fare > 0 && <li>{t('route.fare', { gp: road.fare })}</li>}
      </ul>
      {option.forage && (
        <div className="check-preview">
          <p className="small">
            {t('route.forager', {
              name: nameOf(option.forage.actorId),
              skill: stat(option.forage.skill),
              modifier: formatModifier(option.forage.modifier),
              dc: option.forage.dc,
            })}
          </p>
          <OddsBar
            odds={option.forage.odds}
            faces={tierFaces(option.forage.modifier, option.forage.dc)}
            labelMode="faces"
          />
        </div>
      )}
      {road.reason && <p className="tone-bad small">{road.reason}</p>}
      <div className="actions">
        <button className="primary" disabled={!road.available} onClick={() => onTravel(false)}>
          {t('route.travel')}
        </button>
      </div>
      {road.stowaway && (
        <div className="check-preview">
          <p className="small">
            {t('route.stowawayCheck', {
              name: nameOf(road.stowaway.actorId),
              modifier: formatModifier(road.stowaway.modifier),
              skill: stat(road.stowaway.skill),
              dc: road.stowaway.dc,
            })}
          </p>
          <OddsBar
            odds={road.stowaway.odds}
            faces={tierFaces(road.stowaway.modifier, road.stowaway.dc)}
            labelMode="faces"
          />
          <p className="muted small">{t('route.stowawayHint')}</p>
          <button onClick={() => onTravel(true)}>{t('route.stowaway')}</button>
        </div>
      )}
    </div>
  )
}
