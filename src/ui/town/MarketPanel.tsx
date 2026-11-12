import { useState, type ReactNode } from 'react'
import type { Content } from '../../content/build'
import { load } from '../../engine/economy/capacity'
import { MARKET_STALL, quote, type Quote } from '../../engine/economy/market'
import { marketView, type KnownElsewhere, type MarketRow } from '../../engine/economy/trade'
import { formatGp } from '../../engine/format'
import type { Action } from '../../engine/state'
import { contractRows } from '../../engine/town/contracts'
import { maxWaterskins, partyWaterCapacity } from '../../engine/travel/supplies'
import { GOOD_CATEGORIES } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { contractText } from '../contractText'
import { CapacityMeter } from '../GoodsBar'
import { useI18n, type I18n } from '../i18n/I18n'
import { WATERSKIN_PRICE, WATERSKIN_SELL_PRICE, WATERSKIN_WATER } from '../../engine/constants'

/** The amounts the stepper offers; 'max' is all the party can buy, or all it carries. */
export const AMOUNTS = [1, 5, 10, 'max'] as const
export type Amount = (typeof AMOUNTS)[number]

type T = I18n['t']

/** Supply or demand as arrows: ▲ per level above 0, ▼ per level below, · at 0. */
const arrows = (n: number) => (n > 0 ? '▲'.repeat(n) : n < 0 ? '▼'.repeat(-n) : '·')
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')
const pips = (quality: number) => '●'.repeat(quality) + '○'.repeat(Math.max(0, 5 - quality))

/** "4.4 gp each" or "4.4 → 4.8 gp each", as a bulk trade moves the price. */
function eachText(t: T, q: Quote): string {
  const first = formatGp(q.unitFirst)
  const last = formatGp(q.unitLast)
  return first === last ? t('market.each', { gp: first }) : t('market.eachRange', { first, last })
}

const percent = (share: number) => {
  const n = Math.round(share * 100)
  return n > 0 ? `+${n}%` : n < 0 ? `−${-n}%` : '0%'
}

/**
 * Why a good costs what it does here (designer decision: only on hover or focus, never as text in
 * the table): supply and demand, the producer it comes from, the demand here, a shortage, and
 * the week's swing and the party's own trades when they matter.
 */
export function whyText(t: T, row: MarketRow): string {
  const lines = [
    t('market.levelsValue', { supply: signed(row.supply), demand: signed(row.demand) }),
  ]
  if (row.good === 'water') return lines[0]
  const p = row.why.producer
  lines.push(
    !p
      ? t('market.why.noMaker')
      : p.days === 0
        ? t('market.why.madeHere', { labels: p.labels.join(', ') })
        : t('market.why.madeIn', {
            name: p.name,
            days: t('market.why.days', { n: p.days }),
            labels: p.labels.join(', '),
          })
  )
  const wanted = row.why.demand.filter((d) => d.level > 0).map((d) => d.label)
  if (wanted.length > 0) lines.push(t('market.why.wanted', { reasons: wanted.join(', ') }))
  if (row.shortage) lines.push(t('market.why.shortage'))
  if (Math.abs(row.why.trades) >= 0.01) {
    lines.push(t('market.why.trades', { pct: percent(row.why.trades) }))
  }
  if (Math.abs(row.why.swing) >= 0.05) {
    lines.push(t('market.why.swing', { pct: percent(row.why.swing) }))
  }
  return lines.join('\n')
}

/** The best price known elsewhere, e.g. "pays 31 gp in Avarus · 12 days ago (heard)". */
function knownText(t: T, side: 'sell' | 'buy', k: KnownElsewhere): string {
  const line = t(side === 'sell' ? 'market.paysElsewhere' : 'market.asksElsewhere', {
    gp: formatGp(k.price),
    name: k.name,
    age: k.age === 0 ? t('market.today') : t('market.daysAgo', { n: k.age }),
  })
  return [line, k.heard && t('market.heard'), k.stale && t('market.stale')]
    .filter(Boolean)
    .join(' ')
}

/**
 * Selling a contract's cargo breaks the contract: a confirmation naming it. Off until the engine
 * has an action for it. TODO(merge): the engine agent adds cargo reservation (`cargoInfo`) and a
 * way to sell cargo; wire `onConfirm` to that action and turn this on.
 */
const CARGO_SALE = false

/**
 * The market of the settlement the party is in (design §5): the party's gold and load, big, over
 * every good by category, with its supply and demand, the price to buy and sell one here, the best
 * shop, and the best price the price book knows elsewhere; an amount stepper, and buy and sell
 * buttons showing the live quote for that amount (and why a buy can't go ahead). Water is free and
 * refills by itself, so it has no row; waterskins are a row under Essentials. It heads its zone of
 * the ledger.
 */
export function MarketPanel({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
}) {
  const i18n = useI18n()
  const { t, name, fields } = i18n
  const [amount, setAmount] = useState<Amount>(1)
  const rows = marketView(state, content).filter((r) => r.good !== 'water')
  const here = state.location
  if (rows.length === 0 || here === null) return null
  const amountText = (a: Amount) => (a === 'max' ? t('market.max') : String(a))
  // The contracts whose cargo each good is (courier and freight), by title.
  // TODO(merge): read the engine's `cargoInfo` instead.
  const contracts = contractRows(state, content)
  const cargoOf = (good: string) =>
    contracts
      .filter((c) => (c.kind === 'courier' || c.kind === 'freight') && c.good === good)
      .map((c) => contractText(i18n, c).title)
  return (
    <>
      <div className="market-purse" aria-label={t('market.purseLabel')} role="group">
        <span className="purse-gold">{t('top.gold', { gold: state.gold })}</span>
        <CapacityMeter laden={load(state, content)} />
      </div>
      <div className="zone-head">
        <h3>{t('ledger.market')}</h3>
        <div className="seg-toggle" role="group" aria-label={t('market.amount')}>
          {AMOUNTS.map((a) => (
            <button key={a} aria-pressed={a === amount} onClick={() => setAmount(a)}>
              {amountText(a)}
            </button>
          ))}
        </div>
        <span className="muted small">{t('market.legend')}</span>
      </div>
      <div className="market-scroll">
        <table className="market-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t('market.category')}</span>
              </th>
              <th scope="col">{t('market.good')}</th>
              <th scope="col" title={t('market.levelsHint')}>
                {t('market.levels')}
              </th>
              <th scope="col" className="num">
                {t('market.buy')}
              </th>
              <th scope="col" className="num">
                {t('market.sell')}
              </th>
              <th scope="col">{t('market.shop')}</th>
              <th scope="col">{t('market.elsewhere')}</th>
              <th scope="col">
                <span className="sr-only">{t('market.trade')}</span>
              </th>
            </tr>
          </thead>
          {GOOD_CATEGORIES.map((category) => {
            const group = rows.filter((r) => r.category === category)
            const skins = category === 'essentials'
            const span = group.length + (skins ? 1 : 0)
            return (
              <tbody key={category}>
                {group.map((row, i) => (
                  <MarketLine
                    key={row.good}
                    row={row}
                    goodName={name('goods', row.good, row.name)}
                    head={
                      i === 0 ? (
                        <th scope="rowgroup" rowSpan={span} className="market-cat">
                          <span>{t(`goodCategory.${category}`)}</span>
                        </th>
                      ) : null
                    }
                    amount={amount}
                    quoteFor={(side, n) => quote(state, content, here, row.good, side, n)}
                    uses={fields('goods', row.good)?.uses ?? row.uses}
                    shopName={
                      row.shop &&
                      (row.shop.service === MARKET_STALL
                        ? t('market.stalls')
                        : name('services', row.shop.service, row.shop.name))
                    }
                    cargoFor={cargoOf(row.good)}
                    onAction={onAction}
                  />
                ))}
                {skins && (
                  <WaterskinLine
                    state={state}
                    content={content}
                    amount={amount}
                    onAction={onAction}
                  />
                )}
              </tbody>
            )
          })}
        </table>
      </div>
    </>
  )
}

function MarketLine({
  row,
  goodName,
  head,
  amount,
  quoteFor,
  uses,
  shopName,
  cargoFor,
  onAction,
}: {
  row: MarketRow
  goodName: string
  head: ReactNode
  amount: Amount
  quoteFor: (side: 'buy' | 'sell', n: number) => Quote | null
  /** What the good is for, in the UI language. */
  uses: string
  /** The best shop's name in the UI language. */
  shopName: string | null
  /** The contracts (titles) whose cargo this good is. */
  cargoFor: string[]
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const [sellingCargo, setSellingCargo] = useState(false)
  const buyN = amount === 'max' ? row.maxBuy : amount
  const forSale = row.carried - row.cargo
  const sellN = amount === 'max' ? forSale : Math.min(amount, forSale)
  const buyQuote = row.buy && buyN > 0 ? quoteFor('buy', buyN) : null
  const sellQuote = row.sell && sellN > 0 ? quoteFor('sell', sellN) : null
  // Why the buy can't go ahead: too heavy, or not enough gold.
  const short = row.buy !== null && (buyN === 0 || buyN > row.maxBuy)
  const buyReason = !short
    ? null
    : row.buyLimit === 'weight'
      ? t('market.tooHeavy', { n: row.maxBuy })
      : t('market.tooDear', { n: row.maxBuy })
  const buyWhy = !short
    ? null
    : t(row.buyLimit === 'weight' ? 'market.tooHeavyShort' : 'market.tooDearShort', {
        n: row.maxBuy,
      })
  const known = row.known.sell ?? row.known.buy
  const knownSide = row.known.sell ? 'sell' : 'buy'
  const knownTitle = [
    row.known.sell && knownText(t, 'sell', row.known.sell),
    row.known.buy && knownText(t, 'buy', row.known.buy),
  ]
    .filter(Boolean)
    .join('\n')
  const unit = (q: Quote | null) => (q ? formatGp(q.unitFirst) : '—')
  return (
    <tr className={row.carried > 0 ? 'carried' : undefined}>
      {head}
      <th
        scope="row"
        className="market-good"
        title={row.cargo > 0 ? `${uses}\n${t('market.cargo', { n: row.cargo })}` : uses}
      >
        {goodName} <span className="muted">{forSale > 0 ? forSale : ''}</span>
        {row.cargo > 0 && (
          <span className="badge small cargo-badge">
            {t('market.cargoShort', { n: row.cargo })}
          </span>
        )}
      </th>
      <td
        className="levels"
        title={whyText(t, row)}
        tabIndex={row.good === 'water' ? undefined : 0}
      >
        <span className="supply">{arrows(row.supply)}</span>
        <span className="sep">/</span>
        <span className="demand">{arrows(row.demand)}</span>
        {row.shortage && (
          <span className="shortage" aria-label={t('market.shortage')}>
            !
          </span>
        )}
      </td>
      <td className="num">{unit(row.buy)}</td>
      <td className="num">{unit(row.sell)}</td>
      <td className="shop">
        {row.shop ? (
          <span title={t('market.shopValue', { name: shopName ?? '', quality: row.shop.quality })}>
            <span className="pips" aria-hidden="true">
              {pips(row.shop.quality)}
            </span>
            <span className="sr-only">
              {t('market.shopValue', { name: shopName ?? '', quality: row.shop.quality })}
            </span>
          </span>
        ) : null}
      </td>
      <td
        className={`known${known?.stale ? ' stale' : ''}${known?.heard ? ' heard' : ''}`}
        title={knownTitle || undefined}
      >
        {known && (
          <>
            {knownSide === 'sell' ? '▲' : '▼'}
            {formatGp(known.price)} <span className="known-name">{known.name}</span>{' '}
            <span className="muted">{t('market.ageShort', { n: known.age })}</span>
            {known.heard && <span className="mark"> {t('market.heard')}</span>}
            {known.stale && <span className="mark"> {t('market.stale')}</span>}
          </>
        )}
      </td>
      <td className="trade">
        {row.buy && (
          <button
            disabled={short}
            title={
              buyReason ??
              (buyQuote
                ? t('market.buyQuote', { n: buyN, gp: buyQuote.total, each: eachText(t, buyQuote) })
                : undefined)
            }
            aria-label={t('market.buyLabel', {
              n: buyN,
              good: goodName,
              gp: buyQuote?.total ?? 0,
            })}
            onClick={() => onAction({ type: 'buyGoods', good: row.good, amount: buyN })}
          >
            {t('market.buyButton', { n: buyN, gp: buyQuote?.total ?? '—' })}
          </button>
        )}
        {row.sell && (
          <button
            disabled={sellN === 0}
            title={
              sellQuote
                ? t('market.sellQuote', {
                    n: sellN,
                    gp: sellQuote.total,
                    each: eachText(t, sellQuote),
                  })
                : undefined
            }
            aria-label={t('market.sellLabel', {
              n: sellN,
              good: goodName,
              gp: sellQuote?.total ?? 0,
            })}
            onClick={() => onAction({ type: 'sellGoods', good: row.good, amount: sellN })}
          >
            {t('market.sellButton', { n: sellN, gp: sellQuote?.total ?? '—' })}
          </button>
        )}
        {buyWhy && <div className="trade-why tone-bad">{buyWhy}</div>}
        {CARGO_SALE && row.sell && row.cargo > 0 && cargoFor.length > 0 && (
          <div className="trade-why">
            {sellingCargo ? (
              <>
                <span className="tone-bad">
                  {t('market.sellCargoSure', { titles: cargoFor.join(', ') })}
                </span>{' '}
                {/* TODO(merge): dispatch the engine's cargo-sale action here. */}
                <button onClick={() => setSellingCargo(false)}>
                  {t('market.sellCargoYes')}
                </button>{' '}
                <button onClick={() => setSellingCargo(false)}>{t('contracts.abandonNo')}</button>
              </>
            ) : (
              <button className="link" onClick={() => setSellingCargo(true)}>
                {t('market.sellCargo', { n: row.cargo })}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

/** Extra waterskins: each holds WATERSKIN_WATER more water, filled free here. */
function WaterskinLine({
  state,
  content,
  amount,
  onAction,
}: {
  state: GameState
  content: Content
  amount: Amount
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  // The engine's limit: the gold, and the weight of the water they would hold.
  const affordable = maxWaterskins(state, content).units
  const buyN = amount === 'max' ? affordable : amount
  const sellN = amount === 'max' ? state.waterskins : Math.min(amount, state.waterskins)
  const label = t('market.waterskins')
  const water = state.goods.water ?? 0
  return (
    <tr className={state.waterskins > 0 ? 'carried' : undefined}>
      <th
        scope="row"
        className="market-good"
        title={t('market.waterskinHint', { water: WATERSKIN_WATER })}
      >
        {label} <span className="muted">{state.waterskins > 0 ? state.waterskins : ''}</span>
      </th>
      <td className="levels" />
      <td className="num">{WATERSKIN_PRICE}</td>
      <td className="num">{WATERSKIN_SELL_PRICE}</td>
      <td />
      {/* The water the skins hold, in the otherwise empty Elsewhere column. */}
      <td className="muted">
        {t('market.skinWater', { water, capacity: partyWaterCapacity(state) })}
      </td>
      <td className="trade">
        <button
          disabled={buyN === 0 || buyN > affordable}
          aria-label={t('market.buyLabel', { n: buyN, good: label, gp: buyN * WATERSKIN_PRICE })}
          onClick={() => onAction({ type: 'buyWaterskin', count: buyN })}
        >
          {t('market.buyButton', { n: buyN, gp: buyN * WATERSKIN_PRICE })}
        </button>
        <button
          disabled={sellN === 0}
          aria-label={t('market.sellLabel', {
            n: sellN,
            good: label,
            gp: sellN * WATERSKIN_SELL_PRICE,
          })}
          onClick={() => onAction({ type: 'sellWaterskin', count: sellN })}
        >
          {t('market.sellButton', { n: sellN, gp: sellN * WATERSKIN_SELL_PRICE })}
        </button>
      </td>
    </tr>
  )
}
