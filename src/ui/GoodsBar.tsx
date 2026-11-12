import type { ReactNode } from 'react'
import type { Content } from '../content/build'
import { load, type Load } from '../engine/economy/capacity'
import { goodDef, goodsInCategory } from '../engine/economy/goods'
import { visibleWealth, type VisibleWealth } from '../engine/economy/wealth'
import { formatPercent } from '../engine/format'
import type { Action } from '../engine/state'
import { cargoInfo } from '../engine/town/contracts'
import { partyWaterCapacity } from '../engine/travel/supplies'
import { GOODS, GOOD_CATEGORIES, type Good } from '../schema/types'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { OVERLOAD_RATIO, WEALTH_MAX_STEPS } from '../engine/constants'

const units = (state: Pick<GameState, 'goods'>, good: Good) => state.goods[good] ?? 0

/**
 * The bottom bar (design §9): the goods carried by category (goods at 0 hidden, "—" for an empty
 * category; a contract's cargo marked), the capacity meter, and the visible-wealth pips.
 * `children` adds controls at its end.
 */
export function GoodsBar({
  content,
  state,
  onAction,
  children,
}: {
  content: Content
  state: GameState
  /** With it, a "Drop goods" control leaves goods behind (so loot can't strand the party). */
  onAction?: (a: Action) => void
  children?: ReactNode
}) {
  const { t, name, fields } = useI18n()
  const goodName = (g: Good) => name('goods', g, goodDef(content, g)?.name ?? g)
  const goodUses = (g: Good) => fields('goods', g)?.uses ?? goodDef(content, g)?.uses
  // The units of each good that are a contract's cargo (reserved, and still carried).
  const lots = cargoInfo(state, content).lots
  const cargo = (g: Good) => lots.filter((l) => l.good === g).reduce((n, l) => n + l.carried, 0)
  return (
    <footer className="goods-bar" aria-label={t('goods.heading')}>
      <ul className="goods-groups" aria-label={t('goods.heading')}>
        {GOOD_CATEGORIES.map((category) => {
          const held = goodsInCategory(category).filter((g) => units(state, g) > 0)
          return (
            <li key={category} className="goods-group">
              <span className="goods-cat muted">{t(`goodCategory.${category}`)}</span>
              {held.length === 0 ? (
                <span className="muted"> {t('goods.none')}</span>
              ) : (
                held.map((g) => (
                  <span key={g} className="goods-item" title={goodUses(g)}>
                    {' '}
                    {goodName(g)}{' '}
                    <b>
                      {g === 'water'
                        ? `${units(state, g)}/${partyWaterCapacity(state)}`
                        : units(state, g)}
                    </b>
                    {cargo(g) > 0 && (
                      <span className="badge small cargo-badge">
                        {t('market.cargoShort', { n: cargo(g) })}
                      </span>
                    )}
                  </span>
                ))
              )}
            </li>
          )
        })}
      </ul>
      <span className="spacer" />
      <CapacityMeter laden={load(state, content)} />
      <WealthPips wealth={visibleWealth(state, content)} />
      {onAction && <DropGoods content={content} state={state} onAction={onAction} />}
      {children}
    </footer>
  )
}

/** "34 / 60 kg", a bar filling to the overload line, and Encumbered or Overloaded. */
export function CapacityMeter({ laden }: { laden: Load }) {
  const { t } = useI18n()
  const weight = Math.round(laden.weight)
  const capacity = Math.floor(laden.capacity)
  const max = laden.capacity * OVERLOAD_RATIO
  const fill = max > 0 ? Math.min(1, laden.weight / max) : laden.weight > 0 ? 1 : 0
  const value = t('load.value', { weight, capacity })
  const level = laden.level === 'light' ? null : t(`load.${laden.level}`)
  return (
    <span
      className={`capacity load-${laden.level}`}
      role="group"
      aria-label={t('load.label')}
      title={t('load.hint', { capacity, max: Math.floor(max) })}
    >
      <span className="capacity-bar" aria-hidden="true">
        <span className="capacity-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
        {/* The light limit: capacity is 1 / OVERLOAD_RATIO of the bar. */}
        <span className="capacity-mark" style={{ left: `${Math.round(100 / OVERLOAD_RATIO)}%` }} />
      </span>
      <span className="small">{value}</span>
      {level && <span className="badge load-badge">{level}</span>}
    </span>
  )
}

/**
 * One pip per visible-wealth step; the tooltip says what it costs on the road (the wealth part of
 * the engine's hostile share).
 */
export function WealthPips({ wealth }: { wealth: VisibleWealth }) {
  const { t } = useI18n()
  const pips = Array.from({ length: WEALTH_MAX_STEPS }, (_, i) => (i < wealth.steps ? '◆' : '◇'))
  const pct = formatPercent(wealth.hostile)
  const hint =
    wealth.steps === 0
      ? undefined
      : wealth.purse > 0
        ? t('wealth.hintPurse', {
            precious: Math.round(wealth.precious),
            purse: Math.round(wealth.purse),
            pct,
          })
        : t('wealth.hint', { precious: Math.round(wealth.precious), pct })
  return (
    <span
      className={`wealth${wealth.steps > 0 ? ' shown' : ''}`}
      role="img"
      aria-label={[t('wealth.label', { steps: wealth.steps, max: WEALTH_MAX_STEPS }), hint]
        .filter(Boolean)
        .join('. ')}
      title={hint}
    >
      {pips.join('')}
    </span>
  )
}

/**
 * Leaving goods behind: each good carried with "1" and "all" buttons, in a disclosure that opens
 * upwards from the bar. It is marked when the party is too heavy to set out.
 */
export function DropGoods({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
}) {
  const { t, name } = useI18n()
  const held = GOODS.filter((g) => units(state, g) > 0)
  if (held.length === 0) return null
  const overloaded = load(state, content).level === 'overloaded'
  return (
    <details className={`drop-goods${overloaded ? ' urgent' : ''}`}>
      <summary>{t('drop.heading')}</summary>
      <ul className="drop-list" aria-label={t('drop.heading')}>
        {held.map((g) => {
          const goodName = name('goods', g, goodDef(content, g)?.name ?? g)
          const n = units(state, g)
          const kg = goodDef(content, g)?.weight ?? 0
          return (
            <li key={g}>
              <span>
                {goodName} <b>{n}</b>{' '}
                <span className="muted">
                  {t('drop.weight', { kg: Math.round(kg * n * 10) / 10 })}
                </span>
              </span>
              <button
                aria-label={t('drop.one', { good: goodName })}
                onClick={() => onAction({ type: 'dropGoods', good: g, amount: 1 })}
              >
                −1
              </button>
              <button
                aria-label={t('drop.all', { good: goodName, n })}
                onClick={() => onAction({ type: 'dropGoods', good: g, amount: n })}
              >
                {t('drop.allShort')}
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
