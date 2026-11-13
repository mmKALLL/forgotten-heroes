import type { Content } from '../content/build'
import { crisisInfo, type CrisisActInfo, type CrisisInfo } from '../engine/crisis/status'
import { crisisTracker, type TrackerAct } from '../engine/crisis/tracker'
import { capitalFirst } from '../engine/format'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

type T = ReturnType<typeof useI18n>['t']

/** The act under way, if any. */
export const currentAct = (info: CrisisInfo | null): CrisisActInfo | null =>
  info?.current != null ? (info.acts[info.current] ?? null) : null

/**
 * The endgame tracker (design §10b, Plan 6 K2), below the journal: shown from act I's open day
 * and kept from then on, also once the Crisis is decided. It renders `crisisTracker` (each act's
 * phase, days left, next step, challenge against the party's level, foe and surge), with the
 * villain, its summary and the open act's clues from `crisisInfo` once the plan is known.
 */
export function CrisisTracker({ content, state }: { content: Content; state: GameState }) {
  const { t } = useI18n()
  const tracker = crisisTracker(state, content)
  const info = crisisInfo(state, content)
  if (!tracker?.visible || !info) return null
  return (
    <section className="panel crisis" aria-label={t('crisis.heading')}>
      <h2>{info.name ? capitalFirst(info.name) : t('crisis.heading')}</h2>
      {info.summary && <p className="muted small crisis-summary">{info.summary}</p>}
      {info.ended && <EndedLine t={t} info={info} />}
      <ol className="crisis-acts small">
        {tracker.acts.map((act) => (
          <ActRow
            key={act.n}
            t={t}
            act={act}
            info={info.acts[act.n - 1] ?? null}
            current={tracker.current === act.n - 1}
            partyLevel={tracker.partyLevel}
          />
        ))}
      </ol>
    </section>
  )
}

function EndedLine({ t, info }: { t: T; info: CrisisInfo }) {
  const { outcome, day, text } = info.ended!
  const line =
    info.short === null
      ? t('crisis.lostUnknown', { day })
      : t(outcome === 'won' ? 'crisis.won' : 'crisis.lost', { name: capitalFirst(info.short), day })
  return (
    <p className={`small crisis-ended ${outcome === 'won' ? 'tone-good' : 'tone-bad'}`}>
      {info.short === null ? line : <Tip tip={text}>{line}</Tip>}
    </p>
  )
}

function ActRow(props: {
  t: T
  act: TrackerAct
  info: CrisisActInfo | null
  current: boolean
  partyLevel: number
}) {
  const { t, act, info, current, partyLevel } = props
  const done = act.phase === 'thwarted' || act.phase === 'failed'
  const title = act.name
    ? t('crisis.act', { numeral: act.numeral, name: act.name })
    : t('crisis.actUnknown', { numeral: act.numeral })
  return (
    <li className={current ? 'current' : done ? 'done' : 'future muted'}>
      <div>
        <strong>{title}</strong> <PhaseMark t={t} act={act} info={info} />
        {/* A thwarted or later act stays short: its goal follows its name. */}
        {!current && info && <span className="muted"> · {info.goal}</span>}
      </div>
      {current && info && <div className="muted">{info.goal}</div>}
      {act.next && <div className={current ? 'crisis-next' : undefined}>{act.next}</div>}
      {current && info && (
        <div>
          <Tip tip={t('crisis.cluesHint', { needs: info.needs, at: info.weaknessAt })}>
            {info.weakness
              ? t('crisis.cluesWeakness', { n: info.clues })
              : t('crisis.clues', { n: info.clues, needs: info.needs, at: info.weaknessAt })}
          </Tip>
        </div>
      )}
      {current && <Challenge t={t} act={act} partyLevel={partyLevel} />}
      {current && act.phase === 'prevention' && act.foe && (
        <div>{t('crisis.foe', { name: act.foe })}</div>
      )}
      {!current && act.phase === 'dormant' && act.next && (
        <div>{t('crisis.challenges', { lead: act.leadCr, key: act.keyCr })}</div>
      )}
      {current && act.daysLeft !== null && (
        <div className={act.pressing ? 'tone-bad' : undefined}>
          {act.daysLeft === 0
            ? t('crisis.dueToday', { due: act.due })
            : t('crisis.due', { due: act.due, days: act.daysLeft })}
        </div>
      )}
      {act.surge > 0 && <div className="tone-bad">{t('crisis.surge', { percent: act.surge })}</div>}
      {act.wait > 0 && <div className="tone-bad">{t('crisis.wait', { percent: act.wait })}</div>}
    </li>
  )
}

/** The act's phase: a word while it stands, the day it was thwarted, or that it failed. */
function PhaseMark({ t, act, info }: { t: T; act: TrackerAct; info: CrisisActInfo | null }) {
  if (act.phase === 'thwarted') {
    return (
      <span className="tone-good">{t('crisis.thwarted', { day: info?.thwartedDay ?? '' })}</span>
    )
  }
  if (act.phase === 'failed') return <span className="tone-bad">{t('crisis.failed')}</span>
  return <span className="badge crisis-phase">{t(`crisis.phase.${act.phase}`)}</span>
}

/** The challenge the open act points to (its lead, then its key site) against the party's level. */
function Challenge({ t, act }: { t: T; act: TrackerAct; partyLevel?: number }) {
  const key = act.phase === 'prevention'
  const cr = key ? act.keyCr : act.leadCr
  const level = key ? act.keyLevel : act.leadLevel
  return (
    <div>
      <Tip tip={t('crisis.challengeHint')}>{t('crisis.challenge', { cr, level })}</Tip>
      {act.gap !== 'ok' && (
        <span className={act.gap === 'beyond' ? 'tone-bad' : 'tone-warn'}>
          {' '}
          · {t('crisis.tooStrong')}
        </span>
      )}
    </div>
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
