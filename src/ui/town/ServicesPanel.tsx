import { useState } from 'react'
import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { animalOffers } from '../../engine/town/animals'
import { noticeBoard } from '../../engine/town/contracts'
import { peopleRows, shopKeeper } from '../../engine/town/reputation'
import {
  lodgingOptions,
  needsHealer,
  newsTargets,
  serviceRows,
  type ServiceActionView,
  type ServiceRow,
} from '../../engine/town/services'
import { goodDef } from '../../engine/economy/goods'
import { SERVICE_FUNCTIONS, type Good } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { StandingBadge } from './PeoplePanel'
import { daysText } from '../world/travelText'
import { HEALER_PRICE, PRIVATE_ROOM_FADE } from '../../engine/constants'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

const pips = (quality: number) => '●'.repeat(quality) + '○'.repeat(Math.max(0, 5 - quality))

/**
 * The services here as compact tiles in four columns (design §5), grouped by function: each with
 * its quality and one or two inline actions (lodging, the healer, a blessing, a courier's news,
 * animals); what only trades says what it trades, and what isn't built yet is muted as "coming
 * later". It heads its zone, with a day's rest on carried food beside the heading.
 */
export function ServicesPanel({ content, state, onAction }: Props) {
  const { t } = useI18n()
  const rows = serviceRows(state, content)
  return (
    <>
      <div className="zone-head">
        <h3>{t('ledger.services')}</h3>
        <button
          title={t('place.restHint')}
          onClick={() => onAction({ type: 'rest', lodging: false })}
        >
          {t('services.restOwn')}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">{t('services.none')}</p>
      ) : (
        <div className="service-tiles">
          {SERVICE_FUNCTIONS.map((fn) => {
            const group = rows.filter((r) => r.function === fn)
            if (group.length === 0) return null
            return (
              <div
                key={fn}
                className="service-group"
                role="group"
                aria-label={t(`services.function.${fn}`)}
              >
                {group.map((row) => (
                  <ServiceTile key={row.service} row={row} {...{ content, state, onAction }} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function ServiceTile({ row, content, state, onAction }: Props & { row: ServiceRow }) {
  const { t, name } = useI18n()
  const title = name('services', row.service, row.name)
  // Who keeps it, and the party's standing with them.
  const keeperId =
    state.location === null ? null : shopKeeper(state, content, state.location, row.service)
  const keeper = keeperId ? peopleRows(state, content).find((p) => p.id === keeperId) : undefined
  const hint = [
    title,
    t(`services.function.${row.function}`),
    row.specialty,
    keeper &&
      t('services.keeper', { name: keeper.name, standing: t(`standing.${keeper.standing}`) }),
  ]
    .filter(Boolean)
    .join(' · ')
  const working = row.actions.filter((a) => a.action !== 'market' && a.action !== 'passage')
  const market = row.actions.some((a) => a.action === 'market')
  const passage = row.actions.some((a) => a.action === 'passage')
  return (
    <section
      className={`service-tile fn-${row.function}${row.later ? ' later' : ''}`}
      aria-label={title}
      title={hint}
    >
      <div className="service-name">
        <span>{title}</span>{' '}
        <span
          className="pips"
          role="img"
          aria-label={t('services.quality', { quality: row.quality })}
        >
          {pips(row.quality)}
        </span>
      </div>
      {keeper && keeper.standing !== 'stranger' && (
        <div className="small">
          <StandingBadge standing={keeper.standing} points={keeper.points} />
        </div>
      )}
      <div className="service-actions">
        {working.map((a) => (
          <ServiceAction key={a.action} view={a} row={row} {...{ content, state, onAction }} />
        ))}
        {working.length === 0 && market && <TradesLine content={content} service={row.service} />}
        {passage && <span className="muted small">{t('services.passage')}</span>}
        {row.later && <span className="muted small">{t('services.later')}</span>}
      </div>
    </section>
  )
}

/** What a shop trades, e.g. "Trades food, fuel, gear". */
function TradesLine({ content, service }: { content: Content; service: string }) {
  const { t, name } = useI18n()
  const role = Object.hasOwn(content.serviceRoles, service) ? content.serviceRoles[service] : null
  if (!role) return null
  const names = (goods: readonly Good[]) =>
    goods.map((g) => name('goods', g, goodDef(content, g)?.name ?? g).toLowerCase()).join(', ')
  const parts = [
    role.trades.length > 0 && t('services.trades', { goods: names(role.trades) }),
    role.buysOnly.length > 0 && t('services.buysOnly', { goods: names(role.buysOnly) }),
  ].filter(Boolean)
  return <span className="muted small trades">{parts.join('; ')}</span>
}

function ServiceAction({
  view,
  row,
  content,
  state,
  onAction,
}: Props & { view: ServiceActionView; row: ServiceRow }) {
  const { t, name } = useI18n()
  const [target, setTarget] = useState<string | null>(null)
  const [animal, setAnimal] = useState<string | null>(null)
  switch (view.action) {
    case 'lodging':
      return (
        <>
          {lodgingOptions(state, content).map((room) => (
            <button
              key={room.room}
              disabled={state.gold < room.cost}
              title={t(`services.roomHint.${room.room}`, { n: PRIVATE_ROOM_FADE })}
              onClick={() => onAction({ type: 'rest', lodging: room.room })}
            >
              {t(`services.room.${room.room}`, { gp: room.cost })}
            </button>
          ))}
        </>
      )
    case 'heal': {
      const treated = needsHealer(state)
      const names = state.party.filter((c) => treated.includes(c.id)).map((c) => c.name)
      return (
        <button
          disabled={!view.available}
          title={
            treated.length === 0
              ? t('services.healNone')
              : t('services.healHint', { names: names.join(', ') })
          }
          onClick={() => onAction({ type: 'useService', service: row.service, action: 'heal' })}
        >
          {treated.length === 0
            ? t('services.healEach', { gp: HEALER_PRICE })
            : t('services.heal', { n: treated.length, gp: view.cost ?? 0 })}
        </button>
      )
    }
    case 'bless': {
      const blessed = state.doneHere.includes(`bless:${row.service}`)
      return (
        <button
          disabled={!view.available}
          title={blessed ? t('services.blessed') : t('services.blessHint')}
          onClick={() => onAction({ type: 'useService', service: row.service, action: 'bless' })}
        >
          {blessed ? t('services.blessed') : t('services.bless', { gp: view.cost ?? 0 })}
        </button>
      )
    }
    case 'news': {
      const targets = newsTargets(state, content)
      const chosen = targets.find((s) => s.id === target) ?? targets[0]
      return (
        <span className="inline-pick">
          <select
            aria-label={t('services.newsFrom')}
            value={chosen?.id ?? ''}
            onChange={(e) => setTarget(e.target.value)}
          >
            {targets.map((s) => (
              <option key={s.id} value={s.id}>
                {t('services.newsTarget', { name: s.name, days: daysText(t, s.age) })}
              </option>
            ))}
          </select>
          <button
            disabled={!view.available || !chosen}
            title={t('services.newsHint')}
            onClick={() =>
              chosen &&
              onAction({
                type: 'useService',
                service: row.service,
                action: 'news',
                settlement: chosen.id,
              })
            }
          >
            {t('services.news', { gp: view.cost ?? 0 })}
          </button>
        </span>
      )
    }
    case 'animals': {
      const offers = animalOffers(state, content)
      const chosen = offers.find((o) => o.id === animal) ?? offers[0]
      if (!chosen) return null
      const animalName = (o: (typeof offers)[number]) => name('animals', o.id, o.name)
      const info = [
        t('services.animalInfo', { kg: chosen.capacity, upkeep: chosen.upkeep }),
        chosen.rides !== null && t('services.animalRider', { speed: chosen.rides }),
      ]
        .filter(Boolean)
        .join(' · ')
      return (
        <span className="inline-pick">
          <select
            aria-label={t('services.animal')}
            value={chosen.id}
            onChange={(e) => setAnimal(e.target.value)}
          >
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {t('services.animalOption', { name: animalName(o), gp: o.price })}
              </option>
            ))}
          </select>
          <span className="muted small">{info}</span>
          <button
            disabled={chosen.buyReason !== null}
            onClick={() => onAction({ type: 'buyAnimal', animal: chosen.id })}
          >
            {t('services.buyAnimal', { gp: chosen.price })}
          </button>
          {chosen.owned > 0 && (
            <button onClick={() => onAction({ type: 'sellAnimal', animal: chosen.id })}>
              {t('services.sellAnimal', { n: chosen.owned, gp: chosen.resale })}
            </button>
          )}
        </span>
      )
    }
    case 'rumours':
      // Listening for rumours is a check: its line, with the odds, is in the talk zone.
      return <span className="muted small">{t('services.rumoursThere')}</span>
    case 'board': {
      // The notice board itself, and the contracts held, have their own panels (C4).
      const offers = state.location === null ? [] : noticeBoard(state, content, state.location)
      const here = offers.filter((o) => o.service === null || o.service === row.service)
      return (
        <span className="muted small">
          {here.length === 1
            ? t('services.boardThereOne')
            : t('services.boardThere', { n: here.length })}
        </span>
      )
    }
    default:
      return null
  }
}
