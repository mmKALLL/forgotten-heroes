import type { Content } from '../content/build'
import { CRISIS_LATE_STEP_DAYS, CRISIS_LEEWAY_DAYS, CRISIS_WARN_DAYS } from '../engine/constants'
import { crisisInfo, type CrisisActInfo, type CrisisInfo } from '../engine/crisis/status'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

type T = ReturnType<typeof useI18n>['t']

/** The current act is pressing: due within the journal's warning, or already late. */
export const actPressing = (act: Pick<CrisisActInfo, 'daysLeft' | 'late'>): boolean =>
  act.late > 0 || act.daysLeft <= CRISIS_WARN_DAYS

/** The act under way, if any. */
export const currentAct = (info: CrisisInfo | null): CrisisActInfo | null =>
  info?.current != null ? (info.acts[info.current] ?? null) : null

/** "Late 6d: DC +1 at the site · fails on day 134", explained on hover or focus. */
function LateLine({ t, act }: { t: T; act: CrisisActInfo }) {
  return (
    <div className="tone-bad">
      <Tip tip={t('crisis.lateHint', { step: CRISIS_LATE_STEP_DAYS, leeway: CRISIS_LEEWAY_DAYS })}>
        {t('crisis.late', { days: act.late, dc: act.lateDc, failsOn: act.failsOn })}
      </Tip>
    </div>
  )
}

/**
 * The Crisis under the contracts (design §10b, Plan 5b U2), from the engine's `crisisInfo`.
 * Hidden until the plan is learned, unless the reveal site is known. Then the villain and its
 * three acts: thwarted ones with their day, the current one with where it is, its clues and its
 * due day (or lateness), later ones by name and goal. Once the Crisis ends, one line.
 */
export function CrisisPanel({ content, state }: { content: Content; state: GameState }) {
  const { t } = useI18n()
  const info = crisisInfo(state, content)
  if (!info) return null
  const body = panelBody(t, info)
  if (!body) return null
  return (
    <section className="panel crisis" aria-label={t('crisis.heading')}>
      {body}
    </section>
  )
}

function panelBody(t: T, info: CrisisInfo) {
  if (info.ended) {
    const { outcome, day, text } = info.ended
    const line =
      info.short === null
        ? t('crisis.lostUnknown', { day })
        : t(outcome === 'won' ? 'crisis.won' : 'crisis.lost', { name: info.short, day })
    return (
      <p className={`small crisis-ended ${outcome === 'won' ? 'tone-good' : 'tone-bad'}`}>
        {info.short === null ? line : <Tip tip={text}>{line}</Tip>}
      </p>
    )
  }
  if (info.acts.length === 0) {
    return info.reveal ? (
      <p className="small">{t('crisis.stirs', { site: info.reveal.name })}</p>
    ) : null
  }
  return (
    <>
      <h2>{info.name}</h2>
      {info.summary && <p className="muted small crisis-summary">{info.summary}</p>}
      <ol className="crisis-acts small">
        {info.acts.map((act) => (
          <ActRow key={act.n} t={t} act={act} />
        ))}
      </ol>
    </>
  )
}

function ActRow({ t, act }: { t: T; act: CrisisActInfo }) {
  const done = act.thwartedDay !== null
  const future = !done && !act.current
  return (
    <li className={act.current ? 'current' : future ? 'future muted' : 'done'}>
      <div>
        <strong>{t('crisis.act', { numeral: act.numeral, name: act.name })}</strong>
        {done && (
          <>
            {' '}
            <span className="tone-good">{t('crisis.thwarted', { day: act.thwartedDay! })}</span>
          </>
        )}
        {/* A thwarted or later act takes one line: its goal follows its name. */}
        {!act.current && <span className="muted"> · {act.goal}</span>}
      </div>
      {act.current && <div className="muted">{act.goal}</div>}
      {act.current && (
        <>
          <div>
            {act.poi
              ? act.where
              : act.where
                ? t('crisis.somewhere', { land: act.where })
                : t('crisis.whereUnknown')}
            {' · '}
            <Tip tip={t('crisis.cluesHint', { needs: act.needs, at: act.weaknessAt })}>
              {act.weakness
                ? t('crisis.cluesWeakness', { n: act.clues })
                : t('crisis.clues', { n: act.clues, needs: act.needs, at: act.weaknessAt })}
            </Tip>
          </div>
          {act.late > 0 ? (
            <LateLine t={t} act={act} />
          ) : (
            <div className={actPressing(act) ? 'tone-bad' : undefined}>
              {act.daysLeft === 0
                ? t('crisis.dueToday', { due: act.due })
                : t('crisis.due', { due: act.due, days: act.daysLeft })}
            </div>
          )}
        </>
      )}
    </li>
  )
}

/**
 * The Crisis at the site the party is at (the site panel): which act of whose plot, lateness and
 * the weakness at the current act's site, or the reveal site's promise. Why a quiet site holds
 * nothing more is the visit's refusal (`crisisRefusal`), which the site panel shows.
 */
export function CrisisSiteNote({ content, state }: { content: Content; state: GameState }) {
  const { t } = useI18n()
  const info = crisisInfo(state, content)
  const site = info?.sites.find((s) => s.poi === state.location)
  if (!info || !site) return null
  if (site.kind === 'reveal') {
    return site.quiet ? null : <p className="small crisis-note">{t('crisis.siteReveal')}</p>
  }
  const act = info.acts[site.act! - 1]
  const numeral = act?.numeral ?? String(site.act)
  return (
    <div className="small crisis-note">
      {act && info.short && (
        <p className="crisis-note-head">
          {t('crisis.siteAct', { numeral, name: info.short, act: act.name })}
        </p>
      )}
      {!site.quiet && act && (
        <>
          {act.late > 0 && <LateLine t={t} act={act} />}
          {act.weakness ? (
            <p className="tone-good">{t('crisis.weakness', { name: info.short ?? '' })}</p>
          ) : (
            <p className="muted">{t('crisis.noWeakness', { at: act.weaknessAt })}</p>
          )}
        </>
      )}
    </div>
  )
}
