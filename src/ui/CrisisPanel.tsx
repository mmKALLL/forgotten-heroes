import type { Content } from '../content/build'
import { crisisInfo, type CrisisActInfo, type CrisisInfo } from '../engine/crisis/status'
import { crisisTracker, type TrackerAct } from '../engine/crisis/tracker'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

type T = ReturnType<typeof useI18n>['t']

/** The act under way, if any. */
export const currentAct = (info: CrisisInfo | null): CrisisActInfo | null =>
  info?.current != null ? (info.acts[info.current] ?? null) : null

/**
 * The Crisis under the contracts (design §10b, Plan 5b U2), from the engine's `crisisInfo` (and the
 * next step from `crisisTracker`; Track K's endgame tracker replaces this). Hidden until the plan
 * is learned, unless act I's lead site is known. Then the villain and its three acts: thwarted
 * ones with their day, the open one with its next step, where it is, its clues and its due day,
 * later ones by name and goal. Once the Crisis ends, one line.
 */
export function CrisisPanel({ content, state }: { content: Content; state: GameState }) {
  const { t } = useI18n()
  const info = crisisInfo(state, content)
  if (!info) return null
  const tracker = crisisTracker(state, content)
  const body = panelBody(t, info, tracker?.acts ?? [])
  if (!body) return null
  return (
    <section className="panel crisis" aria-label={t('crisis.heading')}>
      {body}
    </section>
  )
}

function panelBody(t: T, info: CrisisInfo, tracked: TrackerAct[]) {
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
          <ActRow key={act.n} t={t} act={act} next={tracked[act.n - 1]?.next ?? null} />
        ))}
      </ol>
    </>
  )
}

function ActRow({ t, act, next }: { t: T; act: CrisisActInfo; next: string | null }) {
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
          {next && <div>{next}</div>}
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
          <div className={act.pressing ? 'tone-bad' : undefined}>
            {act.daysLeft === 0
              ? t('crisis.dueToday', { due: act.due })
              : t('crisis.due', { due: act.due, days: act.daysLeft })}
          </div>
        </>
      )}
    </li>
  )
}

/**
 * The Crisis at the site the party is at (the site panel): which act of whose plot, and the
 * weakness at the current act's key site, or (before the plan) act I's lead's promise. Why a quiet
 * site holds nothing more is the visit's refusal (`crisisRefusal`), which the site panel shows.
 */
export function CrisisSiteNote({ content, state }: { content: Content; state: GameState }) {
  const { t } = useI18n()
  const info = crisisInfo(state, content)
  const site = info?.sites.find((s) => s.poi === state.location)
  if (!info || !site) return null
  if (info.acts.length === 0) {
    return site.quiet ? null : <p className="small crisis-note">{t('crisis.siteReveal')}</p>
  }
  const act = info.acts[site.act - 1]
  const numeral = act?.numeral ?? String(site.act)
  return (
    <div className="small crisis-note">
      {act && info.short && (
        <p className="crisis-note-head">
          {t('crisis.siteAct', { numeral, name: info.short, act: act.name })}
        </p>
      )}
      {!site.quiet && act && site.kind === 'lead' && (
        <p className="muted">{t('crisis.siteLead')}</p>
      )}
      {!site.quiet && act && site.kind === 'key' && (
        <>
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
