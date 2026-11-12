import { useState, type ReactNode } from 'react'
import type { Content } from '../../content/build'
import { quote, type Quote } from '../../engine/economy/market'
import { marketView, type KnownElsewhere, type MarketRow } from '../../engine/economy/trade'
import { formatGp } from '../../engine/format'
import type { Action } from '../../engine/state'
import { partyWaterCapacity } from '../../engine/travel/supplies'
import { GOOD_CATEGORIES } from '../../schema/types'
import type { GameState } from '../../schema/state'
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
 * The market of the settlement the party is in (design §5): every good by category, with its
 * supply and demand, the price to buy and sell one here, the best shop, and the best price the
 * price book knows elsewhere; an amount stepper, and buy and sell buttons showing the live quote
 * for that amount. Waterskins are a row under Essentials. It heads its zone of the ledger.
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
  const { t, name } = useI18n()
  const [amount, setAmount] = useState<Amount>(1)
  const rows = marketView(state, content)
  const here = state.location
  if (rows.length === 0 || here === null) return null
  const amountText = (a: Amount) => (a === 'max' ? t('market.max') : String(a))
  return (
    <>
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
                    water={
                      row.good === 'water' ? `${row.carried}/${partyWaterCapacity(state)}` : null
                    }
                    onAction={onAction}
                  />
                ))}
                {skins && <WaterskinLine state={state} amount={amount} onAction={onAction} />}
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
  water,
  onAction,
}: {
  row: MarketRow
  goodName: string
  head: ReactNode
  amount: Amount
  quoteFor: (side: 'buy' | 'sell', n: number) => Quote | null
  water: string | null
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const buyN = amount === 'max' ? row.maxBuy : amount
  const sellN = amount === 'max' ? row.carried : Math.min(amount, row.carried)
  const buyQuote = row.buy && buyN > 0 ? quoteFor('buy', buyN) : null
  const sellQuote = row.sell && sellN > 0 ? quoteFor('sell', sellN) : null
  // Why the buy can't go ahead: too heavy, or not enough gold.
  const short = row.buy !== null && (buyN === 0 || buyN > row.maxBuy)
  const buyReason = !short
    ? null
    : row.buyLimit === 'weight'
      ? t('market.tooHeavy', { n: row.maxBuy })
      : t('market.tooDear', { n: row.maxBuy })
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
      <th scope="row" className="market-good" title={row.uses}>
        {goodName} <span className="muted">{water ?? (row.carried > 0 ? row.carried : '')}</span>
      </th>
      <td
        className="levels"
        title={t('market.levelsValue', { supply: signed(row.supply), demand: signed(row.demand) })}
      >
        <span className="supply">{arrows(row.supply)}</span>
        <span className="sep">/</span>
        <span className="demand">{arrows(row.demand)}</span>
      </td>
      <td className="num">{unit(row.buy)}</td>
      <td className="num">{unit(row.sell)}</td>
      <td className="shop">
        {row.shop ? (
          <span title={t('market.shopValue', { name: row.shop.name, quality: row.shop.quality })}>
            <span className="pips" aria-hidden="true">
              {pips(row.shop.quality)}
            </span>
            <span className="sr-only">
              {t('market.shopValue', { name: row.shop.name, quality: row.shop.quality })}
            </span>
          </span>
        ) : (
          row.good === 'water' && <span className="muted">{t('market.free')}</span>
        )}
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
      </td>
    </tr>
  )
}

/** Extra waterskins: each holds WATERSKIN_WATER more water, filled free here. */
function WaterskinLine({
  state,
  amount,
  onAction,
}: {
  state: GameState
  amount: Amount
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const affordable = Math.floor(state.gold / WATERSKIN_PRICE)
  const buyN = amount === 'max' ? affordable : amount
  const sellN = amount === 'max' ? state.waterskins : Math.min(amount, state.waterskins)
  const label = t('market.waterskins')
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
      <td />
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
