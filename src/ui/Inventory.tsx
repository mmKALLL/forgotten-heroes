import { Fragment } from 'react'
import type { Content } from '../content/build'
import { load, type Load } from '../engine/economy/capacity'
import { goodDef, goodsInCategory } from '../engine/economy/goods'
import { visibleWealth, type VisibleWealth } from '../engine/economy/wealth'
import { formatPercent } from '../engine/format'
import type { Action } from '../engine/state'
import { cargoInfo } from '../engine/town/contracts'
import type { SuppliesInfo } from '../engine/travel/preview'
import { GOODS, type Good, type GoodCategory } from '../schema/types'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'
import {
  OVERLOAD_RATIO,
  WEALTH_HOSTILE_PER_STEP,
  WEALTH_MAX_STEPS,
  WEALTH_BREAKPOINTS,
} from '../engine/constants'

const units = (state: Pick<GameState, 'goods'>, good: Good) => state.goods[good] ?? 0

/** The four categories in the top bar's 2×2 block; the essentials are the supplies line. */
const GRID_CATEGORIES: readonly GoodCategory[] = [
  'consumables',
  'equipment',
  'materials',
  'precious',
]

/** A good's name, its uses and the units of it that are a contract's cargo (reserved, and still carried). */
function useGoods(content: Content, state: GameState) {
  const { name, fields } = useI18n()
  const lots = cargoInfo(state, content).lots
  return {
    goodName: (g: Good) => name('goods', g, goodDef(content, g)?.name ?? g),
    goodUses: (g: Good) => fields('goods', g)?.uses ?? goodDef(content, g)?.uses,
    cargo: (g: Good) => lots.filter((l) => l.good === g).reduce((n, l) => n + l.carried, 0),
  }
}

function CargoBadge({ n }: { n: number }) {
  const { t } = useI18n()
  if (n <= 0) return null
  return <span className="badge small cargo-badge">{t('market.cargoShort', { n })}</span>
}

/**
 * The essentials in the top bar (design §9): "Food 5 (2d) · Water 1/8 (0d) · Fuel 2", with the
 * days food and water last for the whole party and a contract's cargo marked.
 */
export function Essentials({
  content,
  state,
  supplies,
}: {
  content: Content
  state: GameState
  supplies: SuppliesInfo
}) {
  const { t } = useI18n()
  const { goodUses, cargo } = useGoods(content, state)
  return (
    <span className="essentials" title={t('top.suppliesHint')}>
      {t('top.food', { food: supplies.food, days: supplies.foodDays })}
      <CargoBadge n={cargo('food')} /> ·{' '}
      {t('top.water', {
        water: supplies.water,
        capacity: supplies.waterCapacity,
        days: supplies.waterDays,
      })}
      <CargoBadge n={cargo('water')} /> ·{' '}
      <span title={goodUses('fuel')}>{t('top.fuel', { fuel: units(state, 'fuel') })}</span>
      <CargoBadge n={cargo('fuel')} />
    </span>
  )
}

/**
 * The rest of the goods carried, in the top bar (design §9): the four other categories as a 2×2
 * block, each "Consum.: Healing 2, Arcana 1" (the full name on hover and for screen readers; goods
 * at 0 hidden, "—" for an empty category; a contract's cargo marked), then the load meter, the
 * visible-wealth pips and "Drop goods" (with `onAction`).
 */
export function TopInventory({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction?: (a: Action) => void
}) {
  const { t } = useI18n()
  const { goodName, goodUses, cargo } = useGoods(content, state)
  return (
    <>
      <ul className="goods-grid" aria-label={t('goods.heading')}>
        {GRID_CATEGORIES.map((category) => {
          const held = goodsInCategory(category).filter((g) => units(state, g) > 0)
          const full = t(`goodCategory.${category}`)
          return (
            <li key={category}>
              <span className="goods-cat muted" title={full}>
                <span aria-hidden="true">{t(`goodCategoryShort.${category}`)}:</span>
                <span className="sr-only">{full}:</span>
              </span>{' '}
              {held.length === 0 ? (
                <span className="muted">{t('goods.none')}</span>
              ) : (
                held.map((g, i) => (
                  <Fragment key={g}>
                    {i > 0 && ', '}
                    <span className="goods-item" title={goodUses(g)}>
                      {goodName(g)} <b>{units(state, g)}</b>
                      <CargoBadge n={cargo(g)} />
                    </span>
                  </Fragment>
                ))
              )}
            </li>
          )
        })}
      </ul>
      <div className="top-stack top-load">
        <CapacityMeter laden={load(state, content)} />
        <span className="top-line">
          <WealthPips wealth={visibleWealth(state, content)} />
          {onAction && <DropGoods content={content} state={state} onAction={onAction} />}
        </span>
      </div>
    </>
  )
}

/**
 * "34 / 60 kg" against the weight at which the party is encumbered, a bar that is full there, and
 * Encumbered or Overloaded. The figures turn yellow when encumbered (the weight past the maximum)
 * and red when overloaded (designer call 2026-11-13); the overload limit is in the tooltip.
 */
export function CapacityMeter({ laden }: { laden: Load }) {
  const { t } = useI18n()
  const weight = Math.round(laden.weight)
  const capacity = Math.floor(laden.capacity)
  const max = laden.capacity * OVERLOAD_RATIO
  const fill =
    laden.capacity > 0 ? Math.min(1, laden.weight / laden.capacity) : laden.weight > 0 ? 1 : 0
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
      </span>
      <span className="small capacity-value">{value}</span>
      {level && <span className="badge load-badge">{level}</span>}
    </span>
  )
}

/**
 * One diamond per visible-wealth step, with a short "Wealth" label. Hover or focus explains what
 * wealth does on the road and what counts, and what the party's wealth costs now (the wealth part
 * of the engine's hostile share).
 */
export function WealthPips({ wealth }: { wealth: VisibleWealth }) {
  const { t } = useI18n()
  const pips = Array.from({ length: WEALTH_MAX_STEPS }, (_, i) => (i < wealth.steps ? '◆' : '◇'))
  const pct = formatPercent(wealth.hostile)
  const now =
    wealth.steps === 0
      ? null
      : wealth.purse > 0
        ? t('wealth.hintPurse', {
            precious: Math.round(wealth.precious),
            purse: Math.round(wealth.purse),
            pct,
          })
        : t('wealth.hint', { precious: Math.round(wealth.precious), pct })
  const explain = t('wealth.explain', {
    pct: formatPercent(WEALTH_HOSTILE_PER_STEP),
    steps: WEALTH_BREAKPOINTS.join(', '),
  })
  return (
    <Tip
      className={`wealth${wealth.steps > 0 ? ' shown' : ''}`}
      label={[t('wealth.label', { steps: wealth.steps, max: WEALTH_MAX_STEPS }), now]
        .filter(Boolean)
        .join('. ')}
      tip={[now, explain].filter(Boolean).join('\n')}
    >
      <span className="wealth-label">{t('wealth.short')}</span>
      <span className="wealth-pips">{pips.join('')}</span>
    </Tip>
  )
}

/**
 * Leaving goods behind: each good carried with "1" and "all" buttons, in a disclosure that opens
 * under the top bar. It is marked when the party is too heavy to set out.
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
