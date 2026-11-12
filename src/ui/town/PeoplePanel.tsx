import { useId } from 'react'
import type { Content } from '../../content/build'
import { formatModifier, formatPercent } from '../../engine/format'
import { tierFaces, type Tier } from '../../engine/rules/checks'
import type { Action } from '../../engine/state'
import { peopleRows } from '../../engine/town/reputation'
import { RUMOURS_DONE, rumourOption, rumourRefusal } from '../../engine/town/rumours'
import type { GameState } from '../../schema/state'
import type { Standing } from '../../schema/types'
import { useI18n } from '../i18n/I18n'
import { TierOutcomes } from '../world/TierOutcomes'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/**
 * The notable people here (design §8): each with their title and name, their role and the
 * party's standing with them. Collapsed until opened (designer decision), so the ledger stays on
 * one screen.
 */
export function PeoplePanel({ content, state }: Omit<Props, 'onAction'>) {
  const { t } = useI18n()
  const people = peopleRows(state, content)
  return (
    <details className="zone zone-people">
      <summary>{t('ledger.people', { n: people.length })}</summary>
      {people.length === 0 ? (
        <p className="muted small">{t('ledger.noPeople')}</p>
      ) : (
        <ul className="people small" aria-label={t('people.list')}>
          {people.map((p) => (
            <li key={p.id}>
              <span className="person-name">{p.name}</span>{' '}
              <span className="muted">· {p.role}</span>{' '}
              <StandingBadge standing={p.standing} points={p.points} />
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

/** A standing tier as a small coloured badge, with the points behind it in its tooltip. */
export function StandingBadge({ standing, points }: { standing: Standing; points?: number }) {
  const { t } = useI18n()
  return (
    <span
      className={`standing standing-${standing}`}
      title={points === undefined ? undefined : t('people.points', { n: points })}
    >
      {t(`standing.${standing}`)}
    </span>
  )
}

/**
 * Listening for rumours at the tavern, as one line in the style of Explore: who listens, with
 * what, against what DC and the chance to hear something, with the non-critical tiers in a tip on
 * hover or focus. Nothing where there is no tavern; a muted note once the talk here is heard.
 */
export function RumoursLine({ content, state, onAction }: Props) {
  const { t, stat } = useI18n()
  const tipId = useId()
  const option = rumourOption(state, content)
  if (!option) {
    const refusal = rumourRefusal(state, content)
    if (refusal === null || !state.doneHere.includes(RUMOURS_DONE)) return null
    return <p className="muted small rumours-line">{t('rumours.heard')}</p>
  }
  const name = state.party.find((c) => c.id === option.actorId)?.name ?? '?'
  const faces = tierFaces(option.modifier, option.dc)
  const pct = formatPercent(1 - option.chances.fail - option.chances.critFail)
  const short = state.gold < option.cost
  const check = {
    name,
    skill: stat(option.skill),
    modifier: formatModifier(option.modifier),
    dc: option.dc,
  }
  return (
    <div className="explore-line rumours-line" role="group" aria-label={t('rumours.heading')}>
      <button
        aria-describedby={tipId}
        disabled={short}
        title={short ? t('rumours.short', { gp: option.cost }) : undefined}
        onClick={() => onAction({ type: 'listenRumours' })}
      >
        {t('rumours.button', { gp: option.cost })}
      </button>{' '}
      <span className="small">{t('rumours.line', { ...check, pct })}</span>
      <div className="hover-tip" id={tipId}>
        <p className="small">{t('rumours.check', check)}</p>
        <TierOutcomes
          label={t('rumours.outcomes')}
          odds={option.chances}
          faces={faces}
          text={(tier: Tier) => t(`rumours.tier.${tier as 'fail' | 'partial' | 'success'}`)}
        />
      </div>
    </div>
  )
}
