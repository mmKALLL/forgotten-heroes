import { useId, useState } from 'react'
import { formatModifier } from '../engine/format'
import {
  ABILITIES,
  SKILLS,
  SKILL_ABILITY,
  abilityModifier,
  statLabel,
} from '../engine/rules/abilities'
import { statModifier } from '../engine/rules/character'
import type { Character, SkillUse } from '../schema/state'

type Props = {
  party: Character[]
  /** Recent encounter checks (groundwork for Strain); the sheet counts today's. */
  skillUses?: SkillUse[]
  day?: number
}

export function PartyPanel({ party, skillUses = [], day }: Props) {
  return (
    <section className="panel" aria-label="Party">
      <h2>Party</h2>
      {party.map((c) => (
        <CharacterCard
          key={c.id}
          character={c}
          usesToday={
            day === undefined
              ? []
              : skillUses.filter((u) => u.characterId === c.id && u.day === day)
          }
        />
      ))}
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
}: {
  character: Character
  usesToday: SkillUse[]
}) {
  const [expanded, setExpanded] = useState(false)
  const sheetId = useId()
  const best = SKILLS.map((s) => ({ s, m: statModifier(c, s) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 3)
  return (
    <article className={expanded ? 'card expanded' : 'card'} aria-label={c.name}>
      <header>
        <button
          type="button"
          className="card-toggle card-head"
          aria-expanded={expanded}
          aria-controls={sheetId}
          onClick={() => setExpanded(!expanded)}
        >
          <strong>{c.name}</strong>{' '}
          <span className="muted">
            {c.ancestry} {c.classId} · lv {c.level}{' '}
            <span className="chevron" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          </span>
        </button>
      </header>
      <div
        className="hp"
        role="meter"
        aria-label={`${c.name} HP`}
        aria-valuenow={Math.max(0, c.hp)}
        aria-valuemin={0}
        aria-valuemax={c.maxHp}
        aria-valuetext={`${c.hp} of ${c.maxHp} HP`}
      >
        <span className="hp-fill" style={{ width: `${(100 * Math.max(0, c.hp)) / c.maxHp}%` }} />
        <span className="hp-text">
          {c.hp}/{c.maxHp} HP
        </span>
      </div>
      {c.exhaustion > 0 && (
        <p className="conditions small">
          <span className="badge condition">Exhaustion {c.exhaustion}</span>
        </p>
      )}
      {expanded ? (
        <div id={sheetId} className="sheet">
          <dl className="abilities">
            {ABILITIES.map((a) => (
              <div key={a}>
                <dt>{a.toUpperCase()}</dt>
                <dd>
                  {c.abilities[a]} <small>{formatModifier(abilityModifier(c.abilities[a]))}</small>
                </dd>
              </div>
            ))}
          </dl>
          <div className="skill-groups">
            {SKILL_GROUPS.map(({ ability, skills }) => (
              <div key={ability} className="skill-group">
                <h4>{ability.toUpperCase()}</h4>
                <ul className="skills">
                  {skills.map((s) => {
                    const proficient = c.skillProficiencies.includes(s)
                    const uses = usesToday.filter((u) => u.skill === s).length
                    return (
                      <li key={s} className={proficient ? 'proficient' : undefined}>
                        {proficient ? (
                          <span
                            className="prof-mark"
                            role="img"
                            aria-label="proficient"
                            title="Proficient"
                          >
                            ●
                          </span>
                        ) : (
                          <span className="prof-mark" aria-hidden="true" />
                        )}
                        <span className="skill-name">{statLabel(s)}</span>
                        <span className="skill-mod">{formatModifier(statModifier(c, s))}</span>
                        {uses > 0 && <span className="skill-uses muted small">{uses}× today</span>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="muted small">● proficient · modifiers include proficiency and exhaustion</p>
        </div>
      ) : (
        <p className="muted small">
          Best: {best.map((b) => `${statLabel(b.s)} ${formatModifier(b.m)}`).join(' · ')}
        </p>
      )}
    </article>
  )
}
