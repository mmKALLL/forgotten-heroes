import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { accessoryOffers } from '../../engine/gear/accessories'
import { animalOffers } from '../../engine/town/animals'
import { recruitOffers } from '../../engine/town/recruits'
import { peopleRows, shopKeeper } from '../../engine/town/reputation'
import {
  lodgingOptions,
  needsHealer,
  NOT_ENOUGH_GOLD,
  newsOptions,
  type NewsOption,
  serviceRows,
  type ServiceActionView,
  type ServiceRow,
  roundOption,
} from '../../engine/town/services'
import { goodDef } from '../../engine/economy/goods'
import type { Good } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { useI18n, type I18n } from '../i18n/I18n'
import { formatModifier } from '../../engine/format'
import { Tip } from '../Tip'
import type { QualityEffect } from '../../engine/economy/market'
import { AccessoryShop } from './AccessoryShop'
import { ArmsShop } from './ArmsShop'
import { armsOffers } from '../../engine/town/arms'
import { RecruitsPanel } from './RecruitsPanel'
import { UpgradeOffers } from './UpgradeOffers'
import { upgradeOffers } from '../../engine/town/upgrades'
import { daysText } from '../world/travelText'
import { CAMP_HEAL, HEALER_PRICE, PRIVATE_ROOM_FADE } from '../../engine/constants'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/**
 * A service's list opened in place of the tiles (the recruits, or an accessory shop), at the
 * settlement it was opened in, so it closes by itself when the party leaves.
 */
export type ServiceList = {
  kind: 'recruits' | 'accessories' | 'arms'
  service: string
  at: string | null
}

/** What a tile needs to open a list, and which opener ("kind/service") takes focus back. */
type Opener = { open: (list: ServiceList) => void; returnTo: string | null }

const listKey = (kind: ServiceList['kind'], service: string) => `${kind}/${service}`

const pips = (quality: number) => '●'.repeat(quality) + '○'.repeat(Math.max(0, 5 - quality))

/** What a service's quality does here (the engine's qualityEffects), one line each. */
export function qualityTip(t: I18n['t'], quality: number, effects: QualityEffect[]): string {
  // Buying is at the middle price + half the spread and selling at − half, so each step of
  // quality is half its spread narrower on each side, in percent of the price.
  const halfPercent = (share: number) => String(Math.round(share * 50 * 10) / 10)
  const lines = [t('services.quality', { quality })]
  for (const e of effects) {
    if (e.effect === 'spread') {
      lines.push(t('quality.spread', { pct: halfPercent(e.perStep) }))
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

/**
 * A service's purchase button: its name and price ("Blessing · −10 gp"), then on a second line the
 * engine's short effect ("+1 Inspiration"); the longer description is its tooltip. A refusal is
 * linked to it for screen readers and shown under it, except for want of gold, which the disabled
 * button says enough (designer): that one is only in the tooltip and the accessible description,
 * as is any refusal where `quiet` (the courier's "nothing fresher", beside its other option).
 */
function BuyButton({
  label,
  effect,
  title,
  reason,
  disabled,
  onClick,
  quiet = false,
}: {
  label: ReactNode
  effect: string | null
  title: string
  reason: string | null
  disabled: boolean
  onClick: () => void
  quiet?: boolean
}) {
  const id = useId()
  const poor = reason === NOT_ENOUGH_GOLD || quiet
  return (
    <>
      <button
        className="service-buy"
        disabled={disabled}
        title={poor ? `${title} · ${reason}` : title}
        aria-describedby={reason ? id : undefined}
        onClick={onClick}
      >
        <span>{label}</span>
        {effect && (
          <>
            {' '}
            <span className="service-effect">{effect}</span>
          </>
        )}
      </button>
      {reason && (
        <span id={id} className={poor ? 'sr-only' : 'service-why muted small'}>
          {reason}
        </span>
      )}
    </>
  )
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
    return list.kind === 'recruits' ? (
      <RecruitsPanel {...props} />
    ) : list.kind === 'arms' ? (
      <ArmsShop {...props} />
    ) : (
      <AccessoryShop {...props} />
    )
  }
  const opener: Opener = { open: setList, returnTo }
  return (
    <>
      <div className="zone-head">
        <h3>{t('ledger.services')}</h3>
        <button
          title={t('place.restHint', { pct: Math.round(CAMP_HEAL * 100) })}
          onClick={() => onAction({ type: 'rest', lodging: false })}
        >
          {t('services.restOwn')}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">{t('services.none')}</p>
      ) : (
        <div className="service-tiles">
          {TILE_KINDS.map((kind) => {
            const group = rows.filter((r) => tileKind(r, state, content) === kind)
            if (group.length === 0) return null
            return (
              <div
                key={kind}
                className="service-group"
                role="group"
                aria-label={t(`services.kind.${kind}`)}
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

/**
 * The tiles in reading order (designer call): places described only, then shops that open a list
 * (recruits, accessories), then shops with a picker (animals), then places with buttons.
 */
const TILE_KINDS = ['info', 'list', 'picker', 'buttons'] as const
type TileKind = (typeof TILE_KINDS)[number]
const LIST_ACTIONS = ['recruit', 'accessories', 'arms']
const PICKER_ACTIONS = ['animals']

/** The actions a tile shows (rumours, the board, the market and passage live elsewhere). */
function tileActions(row: ServiceRow, state: GameState, content: Content): ServiceActionView[] {
  const acting = row.actions.filter(
    (a) => !['market', 'passage', 'rumours', 'board'].includes(a.action)
  )
  // An empty list opener ("Recruits (0)") only shows when it is the tile's one action.
  const filled = acting.filter((a) => !emptyOpener(a.action, row.service, state, content))
  return filled.length > 0 ? filled : acting
}

function tileKind(row: ServiceRow, state: GameState, content: Content): TileKind {
  const actions = tileActions(row, state, content).map((a) => a.action)
  if (actions.some((a) => LIST_ACTIONS.includes(a))) return 'list'
  if (actions.some((a) => PICKER_ACTIONS.includes(a))) return 'picker'
  const upgrades = upgradeOffers(state, content).some((o) => o.service === row.service)
  return actions.length > 0 || upgrades ? 'buttons' : 'info'
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
  // Who keeps it, in the tooltip (people have no reputation of their own: design §8).
  const keeperId =
    state.location === null ? null : shopKeeper(state, content, state.location, row.service)
  const keeper = keeperId ? peopleRows(state, content).find((p) => p.id === keeperId) : undefined
  const specialty = fields('serviceRoles', row.service)?.specialty ?? row.specialty
  const hint = [
    title,
    t(`services.function.${row.function}`),
    specialty,
    keeper && t('services.keeper', { name: keeper.name }),
  ]
    .filter(Boolean)
    .join(' · ')
  const working = tileActions(row, state, content)
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

/**
 * A courier option's tooltip: the towns it brings news of, with how old each is (neighbours), or
 * how many and how old (every town).
 */
function newsTitle(t: I18n['t'], option: NewsOption): string {
  const hint = t(`services.newsHint.${option.reach}`)
  if (option.towns.length === 0) return hint
  const ages = option.towns.map((town) => town.age)
  const [young, old] = [Math.min(...ages), Math.max(...ages)]
  const towns =
    option.reach === 'neighbours'
      ? option.towns
          .map((town) => t('services.newsTarget', { name: town.name, days: daysText(t, town.age) }))
          .join(', ')
      : t('services.newsTowns', {
          n: option.towns.length,
          days: young === old ? daysText(t, old) : `${daysText(t, young)}–${daysText(t, old)}`,
        })
  return `${hint}\n${towns}`
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
    case 'arms': {
      const n = listCount('arms', row.service, state, content)
      return (
        <ListOpener
          kind="arms"
          label={t('arms.open', { n })}
          enabled={n > 0 || state.stash.length > 0}
          {...{ state, row, view, opener }}
        />
      )
    }
    case 'lodging':
      return (
        <>
          {lodgingOptions(state, content).map((room) => (
            <BuyButton
              key={room.room}
              label={t(`services.room.${room.room}`, { gp: room.cost })}
              effect={room.effect}
              title={t(`services.roomHint.${room.room}`, {
                n: PRIVATE_ROOM_FADE,
                pct: Math.round(room.heal * 100),
              })}
              reason={state.gold < room.cost ? NOT_ENOUGH_GOLD : null}
              disabled={state.gold < room.cost}
              onClick={() => onAction({ type: 'rest', lodging: room.room })}
            />
          ))}
        </>
      )
    case 'heal': {
      const treated = needsHealer(state)
      const names = state.party.filter((c) => treated.includes(c.id)).map((c) => c.name)
      return (
        <BuyButton
          label={
            treated.length === 0
              ? t('services.healEach', { gp: HEALER_PRICE })
              : t('services.heal', { n: treated.length, gp: view.cost ?? 0 })
          }
          effect={view.effect}
          title={
            treated.length === 0
              ? t('services.healNone')
              : t('services.healHint', { names: names.join(', ') })
          }
          reason={treated.length === 0 ? t('services.healNone') : view.reason}
          disabled={!view.available}
          onClick={() => onAction({ type: 'useService', service: row.service, action: 'heal' })}
        />
      )
    }
    case 'bless': {
      const blessed = state.doneHere.includes(`bless:${row.service}`)
      return (
        // "Blessed" on the button says it already: no effect line or reason under it.
        <BuyButton
          label={blessed ? t('services.blessed') : t('services.bless', { gp: view.cost ?? 0 })}
          effect={blessed ? null : view.effect}
          title={blessed ? t('services.blessed') : t('services.blessHint')}
          reason={blessed ? null : view.reason}
          disabled={!view.available}
          onClick={() => onAction({ type: 'useService', service: row.service, action: 'bless' })}
        />
      )
    }
    case 'round': {
      const round = roundOption(state)
      const stood = state.doneHere.includes('round')
      return (
        <BuyButton
          label={stood ? t('services.roundStood') : t('services.round', { gp: round.cost })}
          effect={stood ? null : view.effect}
          title={
            round.singer
              ? t('services.roundHintSinger', {
                  n: round.camaraderie,
                  name: round.singer.name,
                  modifier: formatModifier(round.singer.modifier),
                })
              : t('services.roundHint', { n: round.camaraderie })
          }
          reason={stood ? null : view.reason}
          disabled={!view.available}
          onClick={() => onAction({ type: 'useService', service: row.service, action: 'round' })}
        />
      )
    }
    case 'news':
      // Two options (neighbours, every town), each updating exactly the towns the engine lists.
      return (
        <>
          {newsOptions(state, content).map((option) => (
            <BuyButton
              key={option.reach}
              label={t(`services.news.${option.reach}`, { gp: option.cost })}
              effect={option.effect}
              title={newsTitle(t, option)}
              reason={option.reason}
              disabled={!option.available}
              quiet
              onClick={() =>
                onAction({
                  type: 'useService',
                  service: row.service,
                  action: 'news',
                  reach: option.reach,
                })
              }
            />
          ))}
        </>
      )
    case 'animals': {
      const offers = animalOffers(state, content)
      const chosen = offers.find((o) => o.id === animal) ?? offers[0]
      if (!chosen) return null
      const animalName = (o: (typeof offers)[number]) => name('animals', o.id, o.name)
      // The kg is in the picker ("Mule · 20 gp · 90 kg"); beside it, only how fast it rides.
      const rider = chosen.rides !== null ? t('services.animalRider', { speed: chosen.rides }) : ''
      const info = [t('services.animalInfo', { kg: chosen.capacity }), rider]
        .filter(Boolean)
        .join(' · ')
      return (
        <span className="inline-pick">
          <select
            className="animal-pick"
            aria-label={t('services.animal')}
            value={chosen.id}
            onChange={(e) => setAnimal(e.target.value)}
          >
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {t('services.animalOption', { name: animalName(o), gp: o.price, kg: o.capacity })}
              </option>
            ))}
          </select>
          {rider && <span className="muted small">{rider}</span>}
          <BuyButton
            label={t('services.buyAnimal')}
            effect={null}
            title={info}
            reason={chosen.buyReason}
            disabled={chosen.buyReason !== null}
            onClick={() => onAction({ type: 'buyAnimal', animal: chosen.id })}
          />
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
  action: 'recruit' | 'accessories' | 'arms',
  service: string,
  state: GameState,
  content: Content
): number {
  const here = state.location
  if (here === null) return 0
  const offers =
    action === 'recruit'
      ? recruitOffers(state, content, here)
      : action === 'arms'
        ? armsOffers(state, content, here)
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
  if (action === 'arms') {
    return state.stash.length === 0 && listCount(action, service, state, content) === 0
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
          ? t(
              kind === 'recruits'
                ? 'recruits.openHint'
                : kind === 'arms'
                  ? 'arms.openHint'
                  : 'shop.openHint'
            )
          : (view.reason ?? undefined)
      }
      onClick={() => opener.open({ kind, service: row.service, at: state.location })}
    >
      {label}
    </button>
  )
}
