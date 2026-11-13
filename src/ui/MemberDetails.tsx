import { useEffect, useRef, useState } from 'react'
import { describeAccessory } from '../engine/gear/accessories'
import { describeHook } from '../engine/gear/hooks'
import { xpProgress } from '../engine/rules/progression'
import { isAlive, isHired, type CamaraderieInfo } from '../engine/town/camaraderie'
import { oldWoundText } from '../engine/town/recruits'
import type { Action } from '../engine/state'
import type { Accessory } from '../schema/gear'
import type { Character } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

// Plan 5a, U1: the progression parts of a member's card (the XP bar; in the sheet the XP line,
// hired or founder, Dismiss and the accessory slot) and the party's camaraderie line.

/** A thin bar to the next level under the HP bar; none at the cap. */
export function XpBar({ character: c }: { character: Character }) {
  const { t } = useI18n()
  const p = xpProgress(c)
  if (p.toNext === null) return null
  const text = t('party.xpValue', { xp: p.xp, n: p.toNext, level: c.level + 1 })
  return (
    <div
      className="xp-bar"
      role="meter"
      aria-label={t('party.xpLabel', { name: c.name })}
      aria-valuenow={Math.round(p.share * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={text}
      title={text}
    >
      <span className="xp-fill" style={{ width: `${p.share * 100}%` }} />
    </div>
  )
}

/**
 * In the expanded sheet: XP, the accessory slot (the worn one, Take off, and a picker of the
 * party's unworn gear) and, for a hired member, Dismiss with a confirm. Founders stay.
 */
export function MemberDetails({
  character: c,
  gear,
  onAction,
}: {
  character: Character
  /** The party's unworn accessories. */
  gear: readonly Accessory[]
  /** Absent while nothing can be changed (an encounter is open). */
  onAction?: (a: Action) => void
}) {
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)
  // Focus follows the question: to "Keep" when asked, back to Dismiss when kept.
  const keep = useRef<HTMLButtonElement>(null)
  const ask = useRef<HTMLButtonElement>(null)
  const asked = useRef(false)
  useEffect(() => {
    if (confirming) keep.current?.focus()
    else if (asked.current) ask.current?.focus()
    asked.current = confirming
  }, [confirming])
  const p = xpProgress(c)
  const hired = isHired(c)
  const alive = isAlive(c)
  return (
    <div className="member-details small">
      <p>
        {p.toNext === null
          ? t('party.xpCap', { xp: p.xp })
          : t('party.xpValue', { xp: p.xp, n: p.toNext, level: c.level + 1 })}
      </p>
      {c.oldWound && <p className="tone-bad">{t('party.wound', { wound: oldWoundText(c)! })}</p>}
      <AccessorySlot character={c} gear={gear} onAction={onAction} />
      {hired ? (
        <div className="member-hire">
          <span>{t('party.hired')}</span>
          {onAction &&
            (confirming ? (
              <span className="member-confirm">
                <span className="tone-bad">
                  {t(alive ? 'party.dismissAsk' : 'party.layToRestAsk', { name: c.name })}
                </span>{' '}
                <button onClick={() => onAction({ type: 'dismissMember', characterId: c.id })}>
                  {t(alive ? 'party.dismissYes' : 'party.layToRestYes')}
                </button>{' '}
                <button ref={keep} onClick={() => setConfirming(false)}>
                  {t('party.dismissNo')}
                </button>
              </span>
            ) : (
              <button ref={ask} onClick={() => setConfirming(true)}>
                {t(alive ? 'party.dismiss' : 'party.layToRest')}
              </button>
            ))}
        </div>
      ) : (
        <p className="muted">{t('party.founder')}</p>
      )}
    </div>
  )
}

/**
 * The one accessory slot: what is worn (its hooks on hover or tap) with Take off, and a picker of
 * the party's unworn gear to put on (what was worn goes back to the gear).
 */
function AccessorySlot({
  character: c,
  gear,
  onAction,
}: {
  character: Character
  gear: readonly Accessory[]
  onAction?: (a: Action) => void
}) {
  const { t } = useI18n()
  const [pick, setPick] = useState<string | null>(null)
  const chosen = gear.find((g) => g.id === pick) ?? gear[0]
  const worn = c.accessory
  return (
    <div className="accessory-slot">
      <span className="muted">{t('party.accessory')}</span>{' '}
      {worn ? (
        <Tip tip={[worn.name, ...worn.hooks.map(describeHook)].join('\n')}>
          {describeAccessory(worn)}
        </Tip>
      ) : (
        <span className="muted">{t('party.accessoryNone')}</span>
      )}
      {onAction && worn && (
        <button onClick={() => onAction({ type: 'unequipAccessory', characterId: c.id })}>
          {t('party.unequip')}
        </button>
      )}
      {onAction && chosen && isAlive(c) && (
        <span className="inline-pick">
          <select
            aria-label={t('party.wearPick', { name: c.name })}
            value={chosen.id}
            onChange={(e) => setPick(e.target.value)}
          >
            {gear.map((g) => (
              <option key={g.id} value={g.id}>
                {describeAccessory(g)}
              </option>
            ))}
          </select>
          <button
            onClick={() => onAction({ type: 'equipAccessory', characterId: c.id, id: chosen.id })}
          >
            {t(worn ? 'party.swap' : 'party.wear')}
          </button>
        </span>
      )}
    </div>
  )
}

/** "Camaraderie: Steady (25/40)", explained on hover or tap. */
export function CamaraderieLine({ info }: { info: CamaraderieInfo }) {
  const { t } = useI18n()
  const tip = [
    t('camaraderie.tipValue', { label: info.label, value: info.value, max: info.max }),
    t('camaraderie.tipRules'),
    t('camaraderie.tipEffect', {
      max: info.fracturedMax,
      n: Math.round(info.desertChance * 100),
    }),
    info.causes.length > 0
      ? t('camaraderie.tipNow', { causes: info.causes.join('; ') })
      : t('camaraderie.tipFine'),
  ].join('\n')
  const low = info.tier === 'fractured' || info.tier === 'strained'
  return (
    <p className="camaraderie small">
      <Tip tip={tip}>
        {t('camaraderie.label')}{' '}
        <strong className={low ? 'tone-bad' : undefined}>
          {t('camaraderie.value', { label: info.label, value: info.value, max: info.max })}
        </strong>
        {info.desertRisk > 0 && (
          <span className="tone-bad">
            {' · '}
            {t('camaraderie.desert', { n: Math.round(info.desertRisk * 100) })}
          </span>
        )}
      </Tip>
    </p>
  )
}
