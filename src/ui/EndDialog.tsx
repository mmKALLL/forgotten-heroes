import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Content } from '../content/build'
import { runSummary } from '../engine/crisis/ending'
import { crisisInfo } from '../engine/crisis/status'
import { actNumeral, shortName } from '../engine/crisis/text'
import type { GameState } from '../schema/state'
import type { RunEnding } from '../schema/types'
import { useI18n } from './i18n/I18n'

type Props = {
  content: Content
  state: GameState
  ending: RunEnding
  /** Won or lost: dismisses the screen for good (`acknowledgeEnd`) and plays on. */
  onKeepPlaying: () => void
  /** A new party in a new world, in this slot. */
  onNewParty: () => void
  /** Fallen: closes the screen for this session, to look over the ended run. */
  onLookBack: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * The end screens (design §9, Plan 5b U3): victory, game over and fallen, over the game. The
 * story (the villain's defeat, the failed act, or the journal's last lines), then the run's
 * summary from the engine: the plot's acts, the party, and what the run did. Won or lost offer
 * Keep playing (Escape) and New party; fallen offers New party and Look back (Escape).
 * A modal: focus starts on the first button, stays inside (the game behind is inert), and returns
 * where it was on close.
 */
export function EndDialog({
  content,
  state,
  ending,
  onKeepPlaying,
  onNewParty,
  onLookBack,
}: Props) {
  const { t, name } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  // Leaving a living party behind is asked first; a fallen run has nothing left to lose.
  const [asking, setAsking] = useState(false)
  const fallen = ending === 'fallen'
  const dismiss = fallen ? onLookBack : onKeepPlaying

  const backdrop = useRef<HTMLDivElement>(null)

  // The game behind is inert while the dialog is open, so neither a click nor Tab reaches it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const parent = backdrop.current?.parentElement
    const behind = parent
      ? [...parent.children].filter((el) => el !== backdrop.current && !el.hasAttribute('inert'))
      : []
    for (const el of behind) el.setAttribute('inert', '')
    return () => {
      for (const el of behind) el.removeAttribute('inert')
      if (before?.isConnected) before.focus()
    }
  }, [])
  // The first button takes focus on opening, and again when the buttons change.
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.end-actions button')?.focus()
  }, [asking])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (asking) setAsking(false)
      else dismiss()
      return
    }
    if (e.key !== 'Tab' || !box.current) return
    const all = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (all.length === 0) return
    const first = all[0]
    const last = all[all.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const summary = runSummary(state, content)
  const ended = crisisInfo(state, content)?.ended ?? null
  const villain = summary.villain
  const kicker = fallen ? null : t(ending === 'won' ? 'end.victory' : 'end.gameOver')
  // A villain without a given name reads "the Ashen Prophet": capitalised as a heading.
  const title = fallen
    ? t('end.fallenTitle')
    : villain === null
      ? t('end.lostUnknown')
      : t(ending === 'won' ? 'end.wonTitle' : 'end.lostTitle', { name: shortName(villain) })

  return (
    <div
      ref={backdrop}
      className="end-backdrop"
      // A click on the backdrop leaves focus where it was, in the dialog.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div
        ref={box}
        className={`end-dialog panel end-${ending}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-title"
        // A click on its text focuses the dialog itself, so Tab and Escape still work.
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {kicker && <p className="end-kicker">{kicker}</p>}
        <h2 id="end-title">{title.charAt(0).toUpperCase() + title.slice(1)}</h2>
        {!fallen && ended && <p className="end-story">{ended.text}</p>}
        {fallen && summary.lastLines.length > 0 && (
          <section aria-label={t('end.lastLines')}>
            <h3>{t('end.lastLines')}</h3>
            <ol className="end-lines small">
              {summary.lastLines.map((line, i) => (
                <li key={i} className={`tone-${line.tone}`}>
                  <span className="muted">{t('journal.day', { day: line.day })}</span> {line.text}
                </li>
              ))}
            </ol>
          </section>
        )}
        {summary.acts.length > 0 && (
          <section aria-label={t('end.acts')}>
            <h3>
              {t('end.acts')}
              {villain && <span className="muted end-villain"> · {villain}</span>}
            </h3>
            <ol className="end-acts small">
              {summary.acts.map((act, i) => (
                <li key={i}>
                  <span>{t('crisis.act', { numeral: actNumeral(i), name: act.name })}</span>
                  {act.thwartedDay !== null ? (
                    <span className="tone-good">
                      {t('end.actThwarted', { day: act.thwartedDay })}
                    </span>
                  ) : act.failedDay !== null ? (
                    <span className="tone-bad">{t('end.actFailed', { day: act.failedDay })}</span>
                  ) : (
                    <span className="muted">{t('end.actOpen')}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
        <section aria-label={t('end.party')}>
          <h3>{t('end.party')}</h3>
          <ul className="end-party small">
            {summary.party.map((m, i) => (
              <li key={i} className={m.fallen ? 'fell' : undefined}>
                {t('end.member', {
                  name: m.name,
                  ancestry: name('ancestries', m.ancestry, m.ancestry),
                  class: name('classes', m.classId, m.classId),
                  level: m.level,
                })}
                {m.fallen && <span className="tone-bad"> · {t('end.fell')}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={t('end.run')}>
          <h3>{t('end.run')}</h3>
          <p className="small">
            {t('end.stats', { day: summary.day, gold: summary.gold, xp: summary.xp })}
            <br />
            {t('end.sites', { found: summary.sitesDiscovered, cleared: summary.sitesCleared })}
          </p>
        </section>
        {asking ? (
          <div className="end-actions" role="group" aria-label={t('end.newPartySure')}>
            <p className="small">{t('end.newPartySure')}</p>
            <button className="primary" onClick={onNewParty}>
              {t('start.go')}
            </button>
            <button onClick={() => setAsking(false)}>{t('start.cancel')}</button>
          </div>
        ) : fallen ? (
          <div className="end-actions">
            <button className="primary" onClick={onNewParty}>
              {t('end.newParty')}
            </button>
            <button onClick={onLookBack}>{t('end.lookBack')}</button>
          </div>
        ) : (
          <div className="end-actions">
            <button className="primary" onClick={onKeepPlaying}>
              {t(ending === 'won' ? 'end.keepPlaying' : 'end.keepPlayingParty')}
            </button>
            <button onClick={() => setAsking(true)}>{t('end.newParty')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
