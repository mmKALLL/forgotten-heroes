import type { Content } from '../../content/build'
import { formatModifier, formatPercent } from '../../engine/format'
import { tierFaces, type Tier } from '../../engine/rules/checks'
import type { Action } from '../../engine/state'
import {
  placeInfo,
  poiInfo,
  routeOptions,
  type PaceOption,
  type RouteOption,
} from '../../engine/travel/preview'
import { isSevere } from '../../engine/travel/warnings'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { OddsBar } from '../OddsBar'
import { PoiSummary } from './PoiSummary'
import {
  biomeText,
  dangerText,
  daysText,
  findsText,
  paceChoiceOf,
  paceFields,
  realmText,
  roadReasonMessage,
  stowawayText,
  threatLine,
  warningMessage,
  type PaceChoice,
} from './travelText'
import { TierOutcomes } from './TierOutcomes'
import type { TravelPrefs } from './travelPrefs'

/**
 * The roads and paths out of where the party is (a settlement or a point of interest), paths to
 * sites badged; the chosen one's pace chooser and forecast; or, for a place picked on the map
 * that no road reaches, what it is.
 */
export function RoadsOut({
  content,
  state,
  selected,
  onSelect,
  prefs,
  onPrefs,
  onAction,
}: {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (placeId: string | null) => void
  prefs: TravelPrefs
  onPrefs: (p: TravelPrefs) => void
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const { pace, forage } = prefs
  const roads = routeOptions(state, content, forage)
  const chosen = roads.find((r) => r.to === selected) ?? null
  const other = selected && !chosen && selected !== state.location ? selected : null
  const elsewhere = other ? placeInfo(state, content, other) : null
  const site = other ? poiInfo(state, content, other) : null
  const isPoi = (id: string) => Object.hasOwn(state.world.pois, id)
  return (
    <>
      <h3>{t('place.roads')}</h3>
      <ul className="road-list" aria-label={t('place.roads')}>
        {roads.map((r) => (
          <li key={r.routeId}>
            <button aria-pressed={r.to === selected} onClick={() => onSelect(r.to)}>
              {r.toName}
            </button>{' '}
            {isPoi(r.to) && <span className="badge small">{t('place.siteBadge')}</span>}{' '}
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
          onPace={(p) => onPrefs({ ...prefs, pace: p })}
          forage={forage}
          onForage={(f) => onPrefs({ ...prefs, forage: f })}
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
            {t('place.elsewhere', { name: elsewhere.name, type: elsewhere.typeName })}
          </p>
          <p className="muted small">{realmText(t, elsewhere)}</p>
          <p className="small">{threatLine(t, elsewhere)}</p>
          <p className="muted small">{t('route.unreachable', { name: elsewhere.name })}</p>
        </div>
      )}
      {site && (
        <div className="route-info">
          <p className="small">{site.name}</p>
          <PoiSummary info={site} />
          <p className="muted small">{t('route.unreachable', { name: site.name })}</p>
        </div>
      )}
    </>
  )
}

/** Everything about one road at the chosen pace before the party commits (input randomness). */
export function RouteInfo({
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
  const site = poiInfo(state, content, road.to)
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
        <>
          <p className="muted small">{realmText(t, there)}</p>
          <p className="small">
            {there.typeName} · {threatLine(t, there)}
          </p>
        </>
      )}
      {site && <PoiSummary info={site} />}
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
          {/* Severe warnings first, in the danger colour with their own icon. */}
          {[
            ...option.warnings.filter(isSevere),
            ...option.warnings.filter((w) => !isSevere(w)),
          ].map((w) =>
            isSevere(w) ? (
              <li key={w.code} className="severe">
                <span className="warning-icon">☠</span> {warningMessage(t, w)}
              </li>
            ) : (
              <li key={w.code}>⚠ {warningMessage(t, w)}</li>
            )
          )}
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
          <TierOutcomes
            label={t('route.forageOutcomes')}
            odds={option.forage.odds}
            faces={tierFaces(option.forage.modifier, option.forage.dc)}
            text={(tier) => findsText(t, option.forage!.outcomes[tier])}
          />
        </div>
      )}
      {road.reason && <p className="tone-bad small">{roadReasonMessage(t, road.reason)}</p>}
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
          <TierOutcomes
            label={t('route.stowawayOutcomes')}
            odds={road.stowaway.odds}
            faces={tierFaces(road.stowaway.modifier, road.stowaway.dc)}
            text={(tier: Tier) =>
              stowawayText(t, road.stowaway!.outcomes[tier], nameOf(road.stowaway!.actorId))
            }
          />
          <button onClick={() => onTravel(true)}>{t('route.stowaway')}</button>
        </div>
      )}
    </div>
  )
}
