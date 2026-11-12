import { useEffect, useRef, useState } from 'react'
import { formatGp } from '../engine/format'
import { xpProgress } from '../engine/rules/progression'
import { isAlive, isHired, type CamaraderieInfo } from '../engine/town/camaraderie'
import type { Character } from '../schema/state'
import { CAMARADERIE_TIERS } from '../schema/types'
import { DESERT_CHANCE } from '../engine/constants'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

// Plan 5a, U1: the progression parts of a member's card (the XP bar; in the sheet the XP line,
// wage, Dismiss and the accessory slot) and the party's camaraderie line.

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
 * In the expanded sheet: XP, the accessory slot (equipping comes with the accessories, Plan 5a C2)
 * and, for a hired member, the wage and Dismiss with a confirm. Founders draw no wage and stay.
 */
export function MemberDetails({
  character: c,
  onDismiss,
}: {
  character: Character
  /** Absent while dismissing isn't possible (an encounter is open). */
  onDismiss?: (characterId: string) => void
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
      <p className="accessory-slot">
        <span className="muted">{t('party.accessory')}</span>{' '}
        {c.accessory ? c.accessory.name : <span className="muted">{t('party.accessoryNone')}</span>}
      </p>
      {hired ? (
        <div className="member-hire">
          <span>{t('party.wage', { gp: formatGp(c.wage) })}</span>
          {onDismiss &&
            (confirming ? (
              <span className="member-confirm">
                <span className="tone-bad">
                  {t(alive ? 'party.dismissAsk' : 'party.layToRestAsk', { name: c.name })}
                </span>{' '}
                <button onClick={() => onDismiss(c.id)}>
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

/** "Camaraderie: Steady (5/8) · wages 3 gp a day · 2 gp owed", explained on hover or tap. */
export function CamaraderieLine({ info }: { info: CamaraderieInfo }) {
  const { t } = useI18n()
  const fractured = CAMARADERIE_TIERS[1].min - 1
  const tip = [
    t('camaraderie.tipValue', { label: info.label, value: info.value, max: info.max }),
    t('camaraderie.tipRules'),
    t('camaraderie.tipEffect', { max: fractured, n: Math.round(DESERT_CHANCE * 100) }),
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
      {info.wagesPerDay > 0 && (
        <span> · {t('camaraderie.wages', { gp: formatGp(info.wagesPerDay) })}</span>
      )}
      {info.wagesOwed > 0 && (
        <span className="tone-bad">
          {' · '}
          {t('camaraderie.owed', { gp: formatGp(info.wagesOwed) })}
        </span>
      )}
    </p>
  )
}
