import { useEffect, useRef } from 'react'
import type { Content } from '../../content/build'
import { formatModifier } from '../../engine/format'
import { ABILITIES, abilityModifier } from '../../engine/rules/abilities'
import { statModifier } from '../../engine/rules/character'
import type { Action } from '../../engine/state'
import { recruitOffers, type RecruitOffer } from '../../engine/town/recruits'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { ReasonButton } from '../ReasonButton'

type Props = {
  content: Content
  state: GameState
  /** The service whose recruits are listed (one with a `recruits` block). */
  service: string
  onAction: (a: Action) => void
  onClose: () => void
}

/**
 * Who is looking for work at a service this week (Plan 5a U2, design §5): each offer's name,
 * level, ancestry and class, key abilities, proficient skills, sign-on fee, and Hire (when
 * refused, still focusable with the engine's reason inline and announced). After a hire, focus
 * returns to the heading. It replaces the service tiles until closed (the ledger stays on one
 * screen); Escape or Close goes back.
 */
export function RecruitsPanel({ content, state, service, onAction, onClose }: Props) {
  const { t, name } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const here = state.location
  const offers = here === null ? [] : recruitOffers(state, content, here)
  const mine = offers.filter((o) => o.service === service)
  const serviceName = name('services', service, content.services[service]?.name ?? service)
  return (
    <section
      className="recruits"
      aria-label={t('recruits.heading', { service: serviceName })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="zone-head">
        <h3 ref={heading} tabIndex={-1}>
          {t('recruits.heading', { service: serviceName })}
        </h3>
        <button onClick={onClose}>{t('recruits.close')}</button>
      </div>
      {mine.length === 0 ? (
        <p className="muted small">{t('recruits.none')}</p>
      ) : (
        <ul className="recruit-list">
          {mine.map((o) => (
            <RecruitRow
              key={o.id}
              offer={o}
              content={content}
              onAction={(a) => {
                onAction(a)
                // The hired row goes away: focus returns to the list's heading.
                heading.current?.focus()
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function RecruitRow({
  offer: o,
  content,
  onAction,
}: {
  offer: RecruitOffer
  content: Content
  onAction: (a: Action) => void
}) {
  const { t, name, stat } = useI18n()
  const c = o.character
  const ancestry = name(
    'ancestries',
    c.ancestry,
    content.ancestries[c.ancestry]?.name ?? c.ancestry
  )
  const cls = name('classes', c.classId, content.classes[c.classId]?.name ?? c.classId)
  // The two highest scores, in ability order on ties.
  const key = [...ABILITIES].sort((a, b) => c.abilities[b] - c.abilities[a]).slice(0, 2)
  return (
    <li className="recruit" aria-label={c.name}>
      <div className="recruit-head">
        <strong>{c.name}</strong>{' '}
        <span className="muted small">
          {t('recruits.who', { level: o.level, ancestry, class: cls, hp: c.maxHp })}
        </span>
      </div>
      <div className="small">
        {key
          .map(
            (a) =>
              `${stat(a)} ${c.abilities[a]} (${formatModifier(abilityModifier(c.abilities[a]))})`
          )
          .join(' · ')}
        {c.skillProficiencies.length > 0 && (
          <>
            {' · '}
            {c.skillProficiencies
              .map((s) => `${stat(s)} ${formatModifier(statModifier(c, s))}`)
              .join(', ')}
          </>
        )}
      </div>
      <div className="recruit-hire">
        <ReasonButton
          available={o.available}
          reason={o.reason}
          onClick={() => onAction({ type: 'hireRecruit', offerId: o.id })}
        >
          {t('recruits.hire', { fee: o.fee })}
        </ReasonButton>
      </div>
    </li>
  )
}
