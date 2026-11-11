import { formatModifier } from '../engine/format'
import { ABILITIES, SKILLS, abilityModifier, statLabel } from '../engine/rules/abilities'
import { statModifier } from '../engine/rules/character'
import type { Character } from '../schema/state'

export function PartyPanel({ party }: { party: Character[] }) {
  return (
    <section className="panel" aria-label="Party">
      <h2>Party</h2>
      {party.map((c) => (
        <CharacterCard key={c.id} character={c} />
      ))}
    </section>
  )
}

function CharacterCard({ character: c }: { character: Character }) {
  const best = SKILLS.map((s) => ({ s, m: statModifier(c, s) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 3)
  return (
    <article className="card">
      <header className="card-head">
        <strong>{c.name}</strong>
        <span className="muted">
          {c.ancestry} {c.classId} · lv {c.level}
        </span>
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
      <p className="muted small">Best: {best.map((b) => `${statLabel(b.s)} ${formatModifier(b.m)}`).join(' · ')}</p>
    </article>
  )
}
