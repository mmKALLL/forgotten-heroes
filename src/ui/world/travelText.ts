import { FORCED_MARCH_DC } from '../../engine/constants'
import { formatPercent } from '../../engine/format'
import type { PaceOption, PlaceInfo, RoadReason } from '../../engine/travel/preview'
import type { StowawayTierOutcome } from '../../engine/travel/stowaway'
import type { TravelWarning } from '../../engine/travel/warnings'
import type { RestOption } from '../../engine/travel/supplies'
import type { Biome } from '../../schema/types'
import { en, type MessageKey } from '../i18n/en'
import type { I18n } from '../i18n/I18n'

type T = I18n['t']

/**
 * What makes up a road's hostile share, e.g. "10% base, 20% road danger, 10% foraging, −12%
 * stealthy": the base, every part that adds something, and what the pace steers clear of (the
 * share before avoidance is clamped, so they may not sum to it).
 */
export function hostileParts(t: T, option: Pick<PaceOption, 'hostile' | 'pace'>): string {
  const h = option.hostile
  const parts = (['danger', 'threat', 'forage', 'pace', 'wealth', 'escort', 'cargo'] as const)
    .filter((part) => h[part] !== 0)
    .map((part) =>
      t(`route.hostilePart.${part}`, {
        pct: formatPercent(h[part]),
        pace: paceText(t, option.pace).toLowerCase(),
      })
    )
  const avoided =
    h.avoided < 0
      ? [
          t('route.hostilePart.avoided', {
            pct: formatPercent(-h.avoided),
            pace: paceText(t, option.pace).toLowerCase(),
          }),
        ]
      : []
  // A worn ward and the scout's kit lower the share (negative parts).
  const ward = h.ward < 0 ? [t('route.hostilePart.ward', { pct: formatPercent(-h.ward) })] : []
  const scout = h.scout < 0 ? [t('route.hostilePart.scout', { pct: formatPercent(-h.scout) })] : []
  return [
    t('route.hostilePart.base', { pct: formatPercent(h.base) }),
    ...parts,
    ...ward,
    ...scout,
    ...avoided,
  ].join(', ')
}

/** A pace's name; a pace without a string (one the engine has since retired) by its id. */
export const paceText = (t: T, pace: string): string =>
  Object.hasOwn(en, `pace.${pace}`) ? t(`pace.${pace}` as MessageKey) : pace
/** A pace's speed and effect, or nothing for a pace without a string. */
export const paceHintText = (t: T, pace: string): string =>
  Object.hasOwn(en, `paceHint.${pace}`)
    ? t(`paceHint.${pace}` as MessageKey, { dc: FORCED_MARCH_DC })
    : ''

/** The days hired mounts save: "−1 day", "−2 days", or "no faster". */
export const savedText = (t: T, days: number): string =>
  days <= 0
    ? t('route.hireNoFaster')
    : days === 1
      ? t('route.hireSavedOne')
      : t('route.hireSaved', { n: days })

export const daysText = (t: T, n: number): string =>
  n === 1 ? t('count.day') : t('count.days', { n })
/** A countdown to a deadline: "6 days left", "1 day left", "last day", or past it. */
export const leftText = (t: T, n: number): string =>
  n < 0
    ? t('contracts.late')
    : n === 0
      ? t('count.lastDay')
      : n === 1
        ? t('count.dayLeft')
        : t('count.daysLeft', { n })
const rationsText = (t: T, n: number): string =>
  n === 1 ? t('count.ration') : t('count.rations', { n })

export const biomeText = (t: T, biome: Biome | null): string => (biome ? t(`biome.${biome}`) : '?')
export const dangerText = (t: T, danger: number): string =>
  t(`danger.${Math.max(0, Math.min(3, danger))}` as MessageKey)
export const threatText = (t: T, level: number): string =>
  t(`threat.${Math.max(0, Math.min(3, level))}` as MessageKey)
export const sizeText = (t: T, tier: number): string =>
  t(`size.${Math.max(0, Math.min(5, tier))}` as MessageKey)

/**
 * "{land} · domain of {settlement} · {kingdom} ({ancestry} rule)", and the seat marked. A
 * settlement is its own domain, so for one the domain is left out.
 */
export function realmText(
  t: T,
  p: Pick<PlaceInfo, 'landName' | 'domainName' | 'kingdomName' | 'rulerAncestry' | 'seat'> & {
    name?: string
  }
): string {
  const realm = t(p.domainName === p.name ? 'place.realmOwn' : 'place.realm', {
    land: p.landName,
    domain: p.domainName,
    kingdom: p.kingdomName,
    ancestry: p.rulerAncestry,
  })
  return p.seat ? `${realm} · ${t('place.seat')}` : realm
}

/** The domain's threat and level, plus what the lairs the party has found add to it. */
export function threatLine(
  t: T,
  p: Pick<PlaceInfo, 'threatName' | 'threatLevel' | 'lairThreat'>
): string {
  const line = t('place.domainThreat', {
    threat: p.threatName,
    level: threatText(t, p.threatLevel),
  })
  return p.lairThreat > 0 ? `${line} · ${t('place.lairThreat', { n: p.lairThreat })}` : line
}

/** What a forage roll finds (ForageCheck.outcomes), in the UI language. */
export function findsText(t: T, found: { food: number; water: number }): string {
  if (found.food > 0 && found.water > 0)
    return t('forage.findsBoth', { food: found.food, water: found.water })
  if (found.food > 0) return t('forage.findsFood', { food: found.food })
  if (found.water > 0) return t('forage.findsWater', { water: found.water })
  return t('forage.findsNothing')
}

/** What a stowaway roll leads to (StowawayCheck.outcomes); `name` is the one sneaking aboard. */
export function stowawayText(t: T, o: StowawayTierOutcome, name: string): string {
  switch (o.code) {
    case 'unseen':
      return t('stowaway.unseen')
    case 'worked':
      return t('stowaway.worked', {
        days: daysText(t, o.params.days),
        name,
        levels:
          o.params.exhaustion === 1
            ? t('count.level')
            : t('count.levels', { n: o.params.exhaustion }),
      })
    case 'fined':
      return t('stowaway.fined', { gp: o.params.gold })
    case 'brawl':
      return t('stowaway.brawl')
  }
}

/** A supply warning in the UI language (the engine's warningText is the English original). */
export function warningMessage(t: T, w: TravelWarning): string {
  switch (w.code) {
    case 'waterRunsOut':
      return t(w.params.withForaging ? 'warning.waterRunsOutForaging' : 'warning.waterRunsOut', {
        day: w.params.day,
        n: daysText(t, w.params.shortfallDays),
      })
    case 'waterReliesOnForaging':
      return t('warning.waterReliesOnForaging', { day: w.params.day })
    case 'foodRunsOut':
      return w.params.missing > 0
        ? t('warning.foodRunsOutShort', {
            day: w.params.day,
            missing: rationsText(t, w.params.missing),
          })
        : t('warning.foodRunsOut', { day: w.params.day })
    case 'forcedMarchExhaustion':
      return t('warning.forcedMarch', {
        days: daysText(t, w.params.days),
        name: w.params.name,
      })
    case 'encumbered':
      return t('warning.encumbered', w.params)
    case 'departingExhausted': {
      const { members, speedPenalty, checkPenalty, severe } = w.params
      const who = members.map((m) => t('warning.exhaustedMember', { name: m.name, level: m.level }))
      const names =
        who.length === 1
          ? who[0]
          : who.slice(0, -1).join(t('warning.listSep')) + t('warning.listAnd') + who.at(-1)
      return [
        t(
          members.length === 1 ? 'warning.departingExhaustedOne' : 'warning.departingExhaustedMany',
          { names, penalty: checkPenalty }
        ),
        speedPenalty > 0 &&
          t('warning.departingExhaustedSlower', { pct: Math.round(speedPenalty * 100) }),
        severe && t('warning.departingExhaustedDeadly', { name: members[0].name }),
      ]
        .filter(Boolean)
        .join(' ')
    }
    case 'forcedMarchDeadly':
      return t('warning.forcedMarchDeadly', {
        days: daysText(t, w.params.days),
        name: w.params.name,
        pct: Math.round(w.params.chance * 100),
      })
  }
}

/** Why a road can't be taken, in the UI language (the engine's roadReasonText is the English). */
export function roadReasonMessage(t: T, r: RoadReason): string {
  switch (r.code) {
    case 'busy':
      return t('roadReason.busy')
    case 'unfit':
      return t('roadReason.unfit')
    case 'fare':
      return t('roadReason.fare', { gp: r.params.gold })
    case 'overloaded':
      return t('roadReason.overloaded', { kg: r.params.kg })
    case 'animals':
      return t(r.params.roadsOnly ? 'roadReason.cart' : 'roadReason.roughPath', {
        name: r.params.name.toLowerCase(),
      })
    case 'hire':
      return t('roadReason.hire', { gp: r.params.gold })
    case 'slow':
      return t('roadReason.slow', { name: r.params.name.toLowerCase() })
  }
}

/** A day's rest in camp, for the camp buttons' tooltip: the rule, then what the camp kit adds. */
export function campHint(t: T, option: Pick<RestOption, 'kitHeal' | 'healShare'>): string {
  const kit = option.kitHeal > 0 ? t('camp.kit', { pct: Math.round(option.kitHeal * 100) }) : ''
  const pct = Math.round(option.healShare * 100)
  return [t('poi.restHint', { pct }), kit].filter(Boolean).join(' ')
}
