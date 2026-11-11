import { formatModifier, formatPercent } from '../../engine/format'
import type { BranchPreview, OptionPreview } from '../../engine/encounters/preview'
import { TIER_LABELS, tierFaces } from '../../engine/rules/checks'
import { OddsBar, ROLL_MODE_SUFFIX, neededFace, type OddsLabelMode } from '../OddsBar'

type Props = {
  option: OptionPreview
  /** What the twist would be, e.g. "they are bait for an ambush", or null if there is none. */
  twistWhat: string | null
  actorId: string
  onActor: (actorId: string) => void
  onChoose: () => void
  /** d20 faces by default, like the practice check; '%' stays available for a future setting. */
  labelMode?: OddsLabelMode
}

const NEXT = { end: 'ends', stay: 'continues', stage: 'continues' } as const

function Branch({ branch }: { branch: BranchPreview }) {
  return (
    <>
      {branch.text}
      {branch.effects.map((e) => (
        <span key={e} className="chip">
          {e}
        </span>
      ))}
      <span className="muted small"> · {NEXT[branch.next]}</span>
    </>
  )
}

export function OptionCard({ option, twistWhat, actorId, onActor, onChoose, labelMode = 'faces' }: Props) {
  const { check } = option
  // Faces for the modifier actually rolled: the actor's plus the situational one.
  const faces = check ? tierFaces(check.modifier + check.situationalModifier, check.dc) : null
  return (
    <article className="option-card" aria-label={option.label}>
      <header className="card-head">
        <strong>{option.label}</strong>
        {check && (
          <span className="muted">
            {check.label} vs DC {check.dc}
            {check.mode !== 'normal' && ` · ${check.mode === 'advantage' ? 'Edge' : 'Exposed'}`}
          </span>
        )}
      </header>
      {option.description && <p className="muted small">{option.description}</p>}
      {check && faces && (
        <>
          <p className="small">
            <label>
              Actor{' '}
              <select aria-label={`Actor for ${option.label}`} value={actorId} onChange={(e) => onActor(e.target.value)}>
                <option value="">Auto: {check.actors[0]?.name}</option>
                {check.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {formatModifier(a.modifier)}
                  </option>
                ))}
              </select>
            </label>{' '}
            {check.actorName} {formatModifier(check.modifier)}
            {check.situationalModifier !== 0 && ` ${formatModifier(check.situationalModifier)} (situational)`}:{' '}
            {labelMode === 'faces' ? (
              <>
                needs <strong>{neededFace(faces)}+</strong> on the d20{ROLL_MODE_SUFFIX[check.mode]}
              </>
            ) : (
              <>
                <strong>{formatPercent(check.successChance)}</strong> to succeed
              </>
            )}
          </p>
          <OddsBar odds={check.odds} faces={faces} labelMode={labelMode} />
        </>
      )}
      <ul className="outcomes">
        {[...option.outcomes].reverse().map((o) => (
          <li key={o.tier ?? 'fixed'} className={o.tier ? `tier-${o.tier}` : undefined}>
            {o.tier && <strong>{TIER_LABELS[o.tier]}: </strong>}
            <Branch branch={o} />
            {o.twist && (
              <div className="twist small">
                If {twistWhat ?? 'there is a twist'}: <Branch branch={o.twist} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {option.unmet.length > 0 && <p className="tone-bad small">{option.unmet.join(', ')}</p>}
      <button className="primary" disabled={!option.available} onClick={onChoose} aria-label={`Choose ${option.label}`}>
        Choose
      </button>
    </article>
  )
}
