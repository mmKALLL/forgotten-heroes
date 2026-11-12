import { useMemo, useState } from 'react'
import type { Content } from '../content/build'
import { slotSummary, type SlotSummary } from '../engine/slots'
import type { GameState } from '../schema/state'
import { HallOfFallen } from './HallOfFallen'
import { useI18n } from './i18n/I18n'
import { SLOTS, deleteSlot, readSlot } from './saves'

/** What a slot shows: its run's summary, or why there is none. */
type SlotView = { kind: 'empty' } | { kind: 'unreadable' } | { kind: 'saved'; summary: SlotSummary }

/** A pending confirmation in one slot. */
type Confirm = { slot: number; what: 'newParty' | 'delete' } | null

/**
 * The Saves menu in the top bar (Plan 5b, U1): three slots, each with its run's summary. Ironman
 * (design §6): the game auto-saves to the slot being played, so there is no save or copy button.
 * A new party begins in a random mainland settlement (designer decision: no choice of start).
 * Under the slots, the Hall of the Fallen lists every run that ended (U3).
 */
export function SavesMenu({
  content,
  state,
  slot,
  onContinue,
  onNewParty,
}: {
  content: Content
  /** The game being played, in `slot`. */
  state: GameState
  slot: number
  onContinue: (slot: number) => void
  onNewParty: (slot: number) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  // Bumped after a delete, so the slots are read again.
  const [deleted, setDeleted] = useState(0)
  const close = () => {
    setOpen(false)
    setConfirm(null)
  }
  // The other slots are read (and migrated) once each time the menu opens, not on every render.
  const others = useMemo(
    () =>
      new Map(
        open
          ? SLOTS.filter((n) => n !== slot).map((n): [number, SlotView] => {
              const held = readSlot(n, content)
              return [
                n,
                held.kind === 'saved'
                  ? { kind: 'saved', summary: slotSummary(held.state, content) }
                  : held,
              ]
            })
          : []
      ),
    [open, slot, content, deleted]
  )
  const view = (n: number): SlotView =>
    n === slot
      ? { kind: 'saved', summary: slotSummary(state, content) }
      : (others.get(n) ?? { kind: 'empty' })
  return (
    <div className="saves">
      <button aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        {t('saves.button')}
      </button>
      {open && (
        <div
          className="saves-menu"
          role="group"
          aria-label={t('saves.heading')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
        >
          <p className="small muted">{t('saves.ironman')}</p>
          <ol>
            {SLOTS.map((n) => {
              const v = view(n)
              const active = n === slot
              // A run whose party lives (a won or lost Crisis plays on) is lost when replaced: ask
              // first. Only a fallen run has nothing left to lose.
              const ongoing = v.kind === 'saved' && v.summary.ending !== 'fallen'
              const asking = confirm?.slot === n ? confirm.what : null
              return (
                <li key={n}>
                  <section aria-label={t('saves.slot', { n })} className={active ? 'active' : ''}>
                    <h3>
                      {t('saves.slot', { n })}
                      {active && <span className="muted small"> · {t('saves.playing')}</span>}
                    </h3>
                    <SlotLines view={v} />
                    {asking === 'newParty' ? (
                      <div role="group" aria-label={t('start.heading')} className="saves-confirm">
                        <p className="small">{t('start.heading')}</p>
                        <button
                          className="primary"
                          onClick={() => {
                            close()
                            onNewParty(n)
                          }}
                        >
                          {t('start.go')}
                        </button>
                        <button onClick={() => setConfirm(null)}>{t('start.cancel')}</button>
                      </div>
                    ) : asking === 'delete' ? (
                      <div
                        role="group"
                        aria-label={t('saves.deleteSure')}
                        className="saves-confirm"
                      >
                        <p className="small">{t('saves.deleteSure')}</p>
                        <button
                          onClick={() => {
                            deleteSlot(n, content)
                            setConfirm(null)
                            setDeleted((d) => d + 1)
                          }}
                        >
                          {t('saves.delete')}
                        </button>
                        <button onClick={() => setConfirm(null)}>{t('start.cancel')}</button>
                      </div>
                    ) : (
                      <div className="saves-actions">
                        {!active && v.kind === 'saved' && (
                          <button
                            className="primary"
                            onClick={() => {
                              close()
                              onContinue(n)
                            }}
                          >
                            {t('saves.continue')}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (ongoing) setConfirm({ slot: n, what: 'newParty' })
                            else {
                              close()
                              onNewParty(n)
                            }
                          }}
                        >
                          {t('saves.newParty')}
                        </button>
                        {!active && v.kind !== 'empty' && (
                          <button onClick={() => setConfirm({ slot: n, what: 'delete' })}>
                            {t('saves.delete')}
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                </li>
              )
            })}
          </ol>
          <HallOfFallen />
        </div>
      )}
    </div>
  )
}

function SlotLines({ view }: { view: SlotView }) {
  const { t } = useI18n()
  if (view.kind === 'empty') return <p className="muted small">{t('saves.empty')}</p>
  if (view.kind === 'unreadable') return <p className="tone-bad small">{t('saves.unreadable')}</p>
  const s = view.summary
  return (
    <>
      <p className="small">
        {s.party.map((m) => t('saves.member', { name: m.name, level: m.level })).join(', ')}
      </p>
      <p className="muted small">
        {[
          t('top.day', { day: s.day }),
          t('top.gold', { gold: s.gold }),
          s.place && t(s.onRoad ? 'saves.onRoad' : 'saves.at', { place: s.place }),
          s.crisis &&
            (s.crisis.late > 0
              ? t('crisis.markLate', { numeral: s.crisis.numeral, days: s.crisis.late })
              : t('crisis.mark', { numeral: s.crisis.numeral, days: s.crisis.daysLeft })),
          s.ending && t(`saves.ending.${s.ending}`),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </>
  )
}
