import { useState } from 'react'
import type { Content } from '../../content/build'
import { goodDef } from '../../engine/economy/goods'
import { formatModifier } from '../../engine/format'
import type { Action } from '../../engine/state'
import { gatherOptions } from '../../engine/world/gather'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { TierOutcomes } from './TierOutcomes'
import { daysText } from './travelText'

/**
 * Gathering a local good for a day (Plan 5a U3), under Explore in the town ledger: who leads, the
 * check and DC, how picked over the land is, and what each non-critical tier brings home (outcome
 * lines, never an odds bar: design §9). Several goods share one row with a picker, so the ledger
 * stays on one screen. Nothing when the engine offers no gathering here.
 */
export function GatherAction({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
}) {
  const { t, name } = useI18n()
  const [pick, setPick] = useState<string | null>(null)
  const options = gatherOptions(state, content)
  const option = options.find((o) => o.rule === pick) ?? options[0]
  if (!option) return null
  const good = name('goods', option.good, goodDef(content, option.good)?.name ?? option.good)
  const units = (tier: string) => option.outcomes.find((o) => o.tier === tier)?.units ?? 0
  const picked = Math.round(option.depleted * 100)
  const most = Math.max(...option.outcomes.map((o) => o.units))
  const facts = [
    t('gather.line', {
      name: option.actorName,
      check: option.checkLabel,
      modifier: formatModifier(option.modifier),
      dc: option.dc,
    }),
    picked > 0 && t('gather.picked', { pct: picked }),
    option.room <= most && option.room > 0 && t('gather.room', { n: option.room }),
  ].filter(Boolean)
  return (
    <div className="gather-line" role="group" aria-label={t('gather.heading')}>
      <button
        disabled={!option.available}
        onClick={() => onAction({ type: 'gather', rule: option.rule })}
      >
        {t('gather.button', { days: daysText(t, 1) })}
      </button>{' '}
      {options.length > 1 ? (
        <select
          aria-label={t('gather.what')}
          value={option.rule}
          onChange={(e) => setPick(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.rule} value={o.rule}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <strong className="small">{option.label}</strong>
      )}{' '}
      <span className="small">{facts.join(' · ')}</span>
      {option.reason && <p className="tone-bad small">{option.reason}</p>}
      <TierOutcomes
        label={t('gather.outcomes')}
        odds={option.odds}
        faces={option.faces}
        text={(tier) =>
          units(tier) > 0
            ? t('gather.units', { n: units(tier), good: good.toLowerCase() })
            : t('gather.nothing')
        }
      />
    </div>
  )
}
