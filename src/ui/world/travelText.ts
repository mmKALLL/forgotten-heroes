import type { PaceOption, RoadReason } from '../../engine/travel/preview'
import type { TravelWarning } from '../../engine/travel/warnings'
import type { Biome, Pace } from '../../schema/constants'
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

export const daysText = (t: T, n: number): string =>
  n === 1 ? t('count.day') : t('count.days', { n })
const rationsText = (t: T, n: number): string =>
  n === 1 ? t('count.ration') : t('count.rations', { n })

export const biomeText = (t: T, biome: Biome | null): string => (biome ? t(`biome.${biome}`) : '?')
export const dangerText = (t: T, danger: number): string =>
  t(`danger.${Math.max(0, Math.min(3, danger))}` as MessageKey)
export const threatText = (t: T, level: number): string =>
  t(`threat.${Math.max(0, Math.min(3, level))}` as MessageKey)

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
  }
}
