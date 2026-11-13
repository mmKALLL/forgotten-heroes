import { useEffect, useRef, useState } from 'react'
import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { accessoryOffers } from '../../engine/gear/accessories'
import { animalOffers } from '../../engine/town/animals'
import { recruitOffers } from '../../engine/town/recruits'
import { peopleRows, shopKeeper } from '../../engine/town/reputation'
import {
  lodgingOptions,
  needsHealer,
  newsTargets,
  serviceRows,
  type ServiceActionView,
  type ServiceRow,
  roundOption,
} from '../../engine/town/services'
import { goodDef } from '../../engine/economy/goods'
import { SERVICE_FUNCTIONS, type Good } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { useI18n, type I18n } from '../i18n/I18n'
import { Tip } from '../Tip'
import type { QualityEffect } from '../../engine/economy/market'
import { StandingBadge } from './PeoplePanel'
import { AccessoryShop } from './AccessoryShop'
import { RecruitsPanel } from './RecruitsPanel'
import { UpgradeOffers } from './UpgradeOffers'
import { daysText } from '../world/travelText'
import { HEALER_PRICE, PRIVATE_ROOM_FADE } from '../../engine/constants'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/**
 * A service's list opened in place of the tiles (the recruits, or an accessory shop), at the
 * settlement it was opened in, so it closes by itself when the party leaves.
 */
export type ServiceList = { kind: 'recruits' | 'accessories'; service: string; at: string | null }

/** What a tile needs to open a list, and which opener ("kind/service") takes focus back. */
type Opener = { open: (list: ServiceList) => void; returnTo: string | null }

const listKey = (kind: ServiceList['kind'], service: string) => `${kind}/${service}`

const pips = (quality: number) => '●'.repeat(quality) + '○'.repeat(Math.max(0, 5 - quality))

/** What a service's quality does here (the engine's qualityEffects), one line each. */
export function qualityTip(t: I18n['t'], quality: number, effects: QualityEffect[]): string {
  const points = (share: number) => Math.round(Math.abs(share) * 100)
  const lines = [t('services.quality', { quality })]
  for (const e of effects) {
    if (e.effect === 'spread') {
      lines.push(t('quality.spread', { step: points(e.perStep) }))
      lines.push(
        e.vsAverage < 0
          ? t('quality.narrower', { n: points(e.vsAverage) })
          : e.vsAverage > 0
            ? t('quality.wider', { n: points(e.vsAverage) })
            : t('quality.average')
      )
    } else {
      lines.push(t(e.offered ? 'quality.rooms' : 'quality.noRooms', { min: e.minQuality }))
    }
  }
  if (effects.length === 0) lines.push(t('quality.none'))
  return lines.join('\n')
}

/** Quality pips that explain themselves on hover or focus. */
export function QualityPips({ quality, effects }: { quality: number; effects: QualityEffect[] }) {
  const { t } = useI18n()
  return (
    <Tip
      className="pips"
      label={t('services.quality', { quality })}
      tip={qualityTip(t, quality, effects)}
    >
      {pips(quality)}
    </Tip>
  )
}

/** Why a service's button is disabled, shown under it (not only in its tooltip). */
function Why({ reason }: { reason: string | null | undefined }) {
  return reason ? <span className="service-why muted small">{reason}</span> : null
}

/**
 * The services here as compact tiles in four columns (design §5), grouped by function: each with
 * its quality and one or two inline actions (lodging, the healer, a blessing, a courier's news,
 * animals); what only trades says what it trades, and what isn't built yet is muted as "coming
 * later". It heads its zone, with a day's rest on carried food beside the heading.
 */
export function ServicesPanel({ content, state, onAction }: Props) {
  const { t } = useI18n()
  const [list, setList] = useState<ServiceList | null>(null)
  // The opener ("kind/service") that takes focus back after its list closes.
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const rows = serviceRows(state, content)
  if (list && list.at === state.location) {
    const props = {
      content,
      state,
      service: list.service,
      onAction,
      onClose: () => {
        setReturnTo(listKey(list.kind, list.service))
        setList(null)
      },
    }
    return list.kind === 'recruits' ? <RecruitsPanel {...props} /> : <AccessoryShop {...props} />
  }
  const opener: Opener = { open: setList, returnTo }
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
                  <ServiceTile
                    key={row.service}
                    row={row}
                    {...{ content, state, onAction, opener }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function ServiceTile({
  row,
  content,
  state,
  onAction,
  opener,
}: Props & { row: ServiceRow; opener: Opener }) {
  const { t, name, fields } = useI18n()
  const title = name('services', row.service, row.name)
  // Who keeps it, and the party's standing with them.
  const keeperId =
    state.location === null ? null : shopKeeper(state, content, state.location, row.service)
  const keeper = keeperId ? peopleRows(state, content).find((p) => p.id === keeperId) : undefined
  const specialty = fields('serviceRoles', row.service)?.specialty ?? row.specialty
  const hint = [
    title,
    t(`services.function.${row.function}`),
    specialty,
    keeper &&
      t('services.keeper', { name: keeper.name, standing: t(`standing.${keeper.standing}`) }),
  ]
    .filter(Boolean)
    .join(' · ')
  // Rumours and the notice board have their own lines in the talk zone (no pointer here).
  const acting = row.actions.filter(
    (a) => !['market', 'passage', 'rumours', 'board'].includes(a.action)
  )
  // An empty list opener ("Recruits (0)") only shows when it is the tile's one action.
  const filled = acting.filter((a) => !emptyOpener(a.action, row.service, state, content))
  const working = filled.length > 0 ? filled : acting
  const market = row.actions.some((a) => a.action === 'market')
  const passage = row.actions.some((a) => a.action === 'passage')
  return (
    <section
      className={`service-tile fn-${row.function}${row.later ? ' later' : ''}`}
      aria-label={title}
      title={hint}
    >
      <div className="service-name">
        <span>{title}</span> <QualityPips quality={row.quality} effects={row.qualityEffects} />
      </div>
      {keeper && keeper.standing !== 'stranger' && (
        <div className="small">
          <StandingBadge standing={keeper.standing} points={keeper.points} />
        </div>
      )}
      <div className="service-actions">
        {working.map((a) => (
          <ServiceAction
            key={a.action}
            view={a}
            row={row}
            {...{ content, state, onAction, opener }}
          />
        ))}
        {working.length === 0 && market && <TradesLine content={content} service={row.service} />}
        {working.length === 0 && !market && !passage && !row.later && specialty && (
          <span className="muted small trades">{specialty}</span>
        )}
        {passage && <span className="muted small">{t('services.passage')}</span>}
        {row.later && <span className="muted small">{t('services.later')}</span>}
        <UpgradeOffers {...{ content, state, onAction }} service={row.service} />
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
  opener,
}: Props & { view: ServiceActionView; row: ServiceRow; opener: Opener }) {
  const { t, name } = useI18n()
  const [target, setTarget] = useState<string | null>(null)
  const [animal, setAnimal] = useState<string | null>(null)
  switch (view.action) {
    case 'recruit': {
      const n = listCount('recruit', row.service, state, content)
      return (
        <ListOpener
          kind="recruits"
          label={t('recruits.open', { n })}
          enabled={n > 0}
          {...{ state, row, view, opener }}
        />
      )
    }
    case 'accessories': {
      const n = listCount('accessories', row.service, state, content)
      return (
        <ListOpener
          kind="accessories"
          label={t('shop.open', { n })}
          enabled={n > 0 || state.gear.length > 0}
          {...{ state, row, view, opener }}
        />
      )
    }
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
          <Why reason={view.reason} />
        </>
      )
    case 'heal': {
      const treated = needsHealer(state)
      const names = state.party.filter((c) => treated.includes(c.id)).map((c) => c.name)
      return (
        <>
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
          <Why reason={treated.length === 0 ? t('services.healNone') : view.reason} />
        </>
      )
    }
    case 'bless': {
      const blessed = state.doneHere.includes(`bless:${row.service}`)
      return (
        <>
          <button
            disabled={!view.available}
            title={blessed ? t('services.blessed') : t('services.blessHint')}
            onClick={() => onAction({ type: 'useService', service: row.service, action: 'bless' })}
          >
            {blessed ? t('services.blessed') : t('services.bless', { gp: view.cost ?? 0 })}
          </button>
          {/* "Blessed" on the button says it already. */}
          {!blessed && <Why reason={view.reason} />}
        </>
      )
    }
    case 'round': {
      const round = roundOption(state)
      const stood = state.doneHere.includes('round')
      return (
        <>
          <button
            disabled={!view.available}
            title={t('services.roundHint', { n: round.camaraderie })}
            onClick={() => onAction({ type: 'useService', service: row.service, action: 'round' })}
          >
            {stood ? t('services.roundStood') : t('services.round', { gp: round.cost })}
          </button>
          {!stood && <Why reason={view.reason} />}
        </>
      )
    }
    case 'news': {
      // Only towns whose prices the courier's news would make fresher (the engine filters them).
      const targets = newsTargets(state, content)
      const chosen = targets.find((s) => s.id === target) ?? targets[0]
      if (!chosen) return <Why reason={t('services.newsFresh')} />
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
          <Why reason={view.reason} />
        </span>
      )
    }
    case 'animals': {
      const offers = animalOffers(state, content)
      const chosen = offers.find((o) => o.id === animal) ?? offers[0]
      if (!chosen) return null
      const animalName = (o: (typeof offers)[number]) => name('animals', o.id, o.name)
      const info = [
        t('services.animalInfo', { kg: chosen.capacity }),
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
            {t('services.buyAnimal')}
          </button>
          <Why reason={chosen.buyReason} />
          {chosen.owned > 0 && (
            <button onClick={() => onAction({ type: 'sellAnimal', animal: chosen.id })}>
              {t('services.sellAnimal', { n: chosen.owned, gp: chosen.resale })}
            </button>
          )}
        </span>
      )
    }
    default:
      return null
  }
}

/** How many recruits or accessories a service offers here this week. */
function listCount(
  action: 'recruit' | 'accessories',
  service: string,
  state: GameState,
  content: Content
): number {
  const here = state.location
  if (here === null) return 0
  const offers =
    action === 'recruit'
      ? recruitOffers(state, content, here)
      : accessoryOffers(state, content, here)
  return offers.filter((o) => o.service === service).length
}

/**
 * A list opener with nothing to open (no recruits this week; nothing for sale and no gear to
 * sell). A tile with another action leaves it out, so the inn's tile stays short.
 */
function emptyOpener(action: string, service: string, state: GameState, content: Content): boolean {
  if (action === 'recruit') return listCount(action, service, state, content) === 0
  if (action === 'accessories') {
    return state.gear.length === 0 && listCount(action, service, state, content) === 0
  }
  return false
}

/**
 * "Recruits (2)", "Accessories (3)": opens the list in place of the tiles. With nothing in it, the
 * button is disabled and the reason stays in its tooltip (the tiles stay short); with something
 * to look at, a refusal (a full party, too little gold) shows in the list.
 */
function ListOpener({
  kind,
  label,
  enabled,
  state,
  row,
  view,
  opener,
}: {
  kind: ServiceList['kind']
  label: string
  enabled: boolean
  state: GameState
  row: ServiceRow
  view: ServiceActionView
  opener: Opener
}) {
  const { t } = useI18n()
  const button = useRef<HTMLButtonElement>(null)
  const back = opener.returnTo === listKey(kind, row.service)
  useEffect(() => {
    if (back) button.current?.focus()
  }, [back])
  return (
    <button
      ref={button}
      disabled={!enabled}
      title={
        enabled
          ? t(kind === 'recruits' ? 'recruits.openHint' : 'shop.openHint')
          : (view.reason ?? undefined)
      }
      onClick={() => opener.open({ kind, service: row.service, at: state.location })}
    >
      {label}
    </button>
  )
}
