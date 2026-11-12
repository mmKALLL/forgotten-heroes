import { formatPercent } from '../../engine/format'
import type { PaceOption, PlaceInfo, RoadReason } from '../../engine/travel/preview'
import type { StowawayTierOutcome } from '../../engine/travel/stowaway'
import type { TravelWarning } from '../../engine/travel/warnings'
import type { Biome, Pace } from '../../schema/types'
import type { MessageKey } from '../i18n/en'
import type { I18n } from '../i18n/I18n'

/** The five ways to walk a land road, as the pace chooser lists them. */
export const PACE_CHOICES = ['cautious', 'cover', 'steady', 'brisk', 'forced'] as const
export type PaceChoice = (typeof PACE_CHOICES)[number]

export const paceChoiceOf = (p: Pick<PaceOption, 'pace' | 'coverTracks'>): PaceChoice =>
  p.pace === 'cautious' && p.coverTracks ? 'cover' : p.pace

/** The travel action's pace fields for a choice. */
export const paceFields = (choice: PaceChoice): { pace: Pace; coverTracks: boolean } =>
  choice === 'cover'
    ? { pace: 'cautious', coverTracks: true }
    : { pace: choice, coverTracks: false }

type T = I18n['t']

/**
 * What makes up a road's hostile share, e.g. "25% base, +20% road danger, +10% foraging": the
 * base and every part that adds something (the share is clamped, so they may not sum to it).
 */
export function hostileParts(t: T, option: Pick<PaceOption, 'hostile'>): string {
  const h = option.hostile
  const parts = (['danger', 'threat', 'forage', 'pace'] as const)
    .filter((part) => h[part] !== 0)
    .map((part) => t(`route.hostilePart.${part}`, { pct: formatPercent(h[part]) }))
  return [t('route.hostilePart.base', { pct: formatPercent(h.base) }), ...parts].join(', ')
}

export const daysText = (t: T, n: number): string =>
  n === 1 ? t('count.day') : t('count.days', { n })
const rationsText = (t: T, n: number): string =>
  n === 1 ? t('count.ration') : t('count.rations', { n })

export const biomeText = (t: T, biome: Biome | null): string => (biome ? t(`biome.${biome}`) : '?')
export const dangerText = (t: T, danger: number): string =>
  t(`danger.${Math.max(0, Math.min(3, danger))}` as MessageKey)
export const threatText = (t: T, level: number): string =>
  t(`threat.${Math.max(0, Math.min(3, level))}` as MessageKey)
export const sizeText = (t: T, tier: number): string =>
  t(`size.${Math.max(0, Math.min(5, tier))}` as MessageKey)

/** "{land} · domain of {settlement} · {kingdom} ({ancestry} rule)", and the seat marked. */
export function realmText(
  t: T,
  p: Pick<PlaceInfo, 'landName' | 'domainName' | 'kingdomName' | 'rulerAncestry' | 'seat'>
): string {
  const realm = t('place.realm', {
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
        dc: w.params.dc,
        name: w.params.name,
        levels: w.params.expectedLevels.toFixed(1),
      })
    case 'encumbered':
      return t('warning.encumbered', w.params)
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
  }
}
