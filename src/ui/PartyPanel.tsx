import { useId, useState } from 'react'
import { formatModifier } from '../engine/format'
import { ABILITIES, SKILLS, SKILL_ABILITY, abilityModifier } from '../engine/rules/abilities'
import { statModifier } from '../engine/rules/character'
import { strainOf } from '../engine/rules/strain'
import type { Action } from '../engine/state'
import type { Accessory } from '../schema/gear'
import type { Character, SkillUse } from '../schema/state'
import type { CamaraderieInfo } from '../engine/town/camaraderie'
import { levelNumeral, type OwnedUpgrade } from '../engine/town/upgrades'
import { useI18n } from './i18n/I18n'
import { CamaraderieLine, MemberDetails, XpBar } from './MemberDetails'

type Props = {
  party: Character[]
  /** Recent encounter checks (groundwork for Strain); the sheet counts today's. */
  skillUses?: SkillUse[]
  day?: number
  /** The party's camaraderie line under the cards (camaraderieInfo); none when absent. */
  camaraderie?: CamaraderieInfo
  /** The party's unworn accessories, for each sheet's picker. */
  gear?: readonly Accessory[]
  /** Dismiss, wear and take off; absent while that isn't possible (an encounter is open). */
  onAction?: (a: Action) => void
  /** The party's upgrades (ownedUpgrades), listed compactly under the camaraderie. */
  upgrades?: readonly OwnedUpgrade[]
}

export function PartyPanel({
  party,
  skillUses = [],
  day,
  camaraderie,
  gear = [],
  onAction,
  upgrades = [],
}: Props) {
  const { t } = useI18n()
  return (
    <section className="panel" aria-label={t('party.heading')}>
      <h2>{t('party.heading')}</h2>
      {party.map((c) => (
        <CharacterCard
          key={c.id}
          character={c}
          gear={gear}
          onAction={onAction}
          usesToday={
            day === undefined
              ? []
              : skillUses.filter((u) => u.characterId === c.id && u.day === day)
          }
        />
      ))}
      {camaraderie && <CamaraderieLine info={camaraderie} />}
      {upgrades.length > 0 && (
        <p className="small upgrades-owned">
          <span className="muted">{t('upgrades.owned')}:</span>{' '}
          {upgrades.map((u, i) => (
            <span key={u.id}>
              {i > 0 && ' · '}
              <span title={u.effect}>
                {t('upgrades.ownedItem', { name: u.name, level: levelNumeral(u.level) })}
              </span>
            </span>
          ))}
        </p>
      )}
    </section>
  )
}

/** Skills grouped under their default ability, in ability order; abilities with none are left out. */
const SKILL_GROUPS = ABILITIES.map((ability) => ({
  ability,
  skills: SKILLS.filter((s) => SKILL_ABILITY[s] === ability),
})).filter((g) => g.skills.length > 0)

/** Compact by default; the header button expands it into a full character sheet (UI state only). */
function CharacterCard({
  character: c,
  usesToday,
  gear,
  onAction,
}: {
  character: Character
  usesToday: SkillUse[]
  gear: readonly Accessory[]
  onAction?: (a: Action) => void
}) {
  const { t, stat, name } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const sheetId = useId()
  const best = SKILLS.map((s) => ({ s, m: statModifier(c, s) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 3)
  const strained = SKILLS.map((s) => [s, strainOf(c, s)] as const).filter(([, n]) => n > 0)
  return (
    <article className={expanded ? 'card expanded' : 'card'} aria-label={c.name}>
      <h3 className="card-name">
        <button
          type="button"
          className="card-toggle card-head"
          aria-expanded={expanded}
          aria-controls={sheetId}
          onClick={() => setExpanded(!expanded)}
        >
          <strong>{c.name}</strong>{' '}
          <span className="muted">
            {t('party.summary', {
              ancestry: name('ancestries', c.ancestry, c.ancestry),
              class: name('classes', c.classId, c.classId),
              level: c.level,
            })}{' '}
            <span className="chevron" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          </span>
        </button>
      </h3>
      <div
        className="hp"
        role="meter"
        aria-label={t('party.hpLabel', { name: c.name })}
        aria-valuenow={Math.max(0, c.hp)}
        aria-valuemin={0}
        aria-valuemax={c.maxHp}
        aria-valuetext={t('party.hpValue', { hp: c.hp, max: c.maxHp })}
      >
        <span className="hp-fill" style={{ width: `${(100 * Math.max(0, c.hp)) / c.maxHp}%` }} />
        <span className="hp-text">
          {c.hp}/{c.maxHp} HP
        </span>
      </div>
      <XpBar character={c} />
      {/* Open, the sheet shows strain by each skill: the card's badges would say it twice. */}
      {(c.exhaustion > 0 || (strained.length > 0 && !expanded)) && (
        <p className="conditions small">
          {c.exhaustion > 0 && (
            <span className="badge condition">{t('party.exhaustion', { n: c.exhaustion })}</span>
          )}
          {!expanded &&
            strained.map(([skill, n]) => (
              <span key={skill} className="badge condition strain" title={t('party.strainHint')}>
                {t('party.strain', { skill: stat(skill), n })}
              </span>
            ))}
        </p>
      )}
      {/* Always in the page, so aria-controls has a target; hidden while collapsed. */}
      <div id={sheetId} className="sheet" hidden={!expanded}>
        <dl className="abilities">
          {ABILITIES.map((a) => (
            <div key={a}>
              <dt>{stat(a)}</dt>
              <dd>
                {c.abilities[a]} <small>{formatModifier(abilityModifier(c.abilities[a]))}</small>
              </dd>
            </div>
          ))}
        </dl>
        <div className="skill-groups">
          {SKILL_GROUPS.map(({ ability, skills }) => (
            <div key={ability} className="skill-group">
              <h4>{stat(ability)}</h4>
              <ul className="skills">
                {skills.map((s) => {
                  const proficient = c.skillProficiencies.includes(s)
                  const uses = usesToday.filter((u) => u.skill === s).length
                  const strain = strainOf(c, s)
                  return (
                    <li key={s} className={proficient ? 'proficient' : undefined}>
                      {proficient ? (
                        <span
                          className="prof-mark"
                          role="img"
                          aria-label={t('party.proficient')}
                          title={t('party.proficient')}
                        >
                          ●
                        </span>
                      ) : (
                        <span className="prof-mark" aria-hidden="true" />
                      )}
                      <span className="skill-name">{stat(s)}</span>
                      <span className="skill-mod">{formatModifier(statModifier(c, s))}</span>
                      {strain > 0 && (
                        <span className="badge strain" title={t('party.strainHint')}>
                          {t('party.strainSheet', { n: strain })}
                        </span>
                      )}
                      {uses > 0 && (
                        <span className="skill-uses muted small">
                          {t('party.usesToday', { n: uses })}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="muted small">{t('party.legend')}</p>
        <MemberDetails character={c} gear={gear} onAction={onAction} />
      </div>
      {!expanded && (
        <p className="muted small">
          {t('party.best', {
            list: best.map((b) => `${stat(b.s)} ${formatModifier(b.m)}`).join(' · '),
          })}
        </p>
      )}
    </article>
  )
}
