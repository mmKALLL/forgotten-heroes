import type {
  BranchPreview,
  OptionPreview,
  ShownOutcome,
  TwistInfo,
} from '../../engine/encounters/preview'
import { formatPercent } from '../../engine/format'
import { TIER_LABELS } from '../../engine/rules/checks'

function Branch({ branch }: { branch: BranchPreview }) {
  return (
    <>
      {branch.text}
      {branch.effects.map((e) => (
        <span key={e} className="chip">
          {e}
        </span>
      ))}
    </>
  )
}

/**
 * The outcome tiers of the option last hovered or focused, shared by every option card. The box
 * keeps a fixed height (long text scrolls inside it) so changing what it shows never moves the
 * cards above it. Each card's choose target points here with aria-describedby. Critical tiers
 * arrive hidden from the engine and get no row: only their odds show, on the card's bar.
 */
export function OutcomesPanel({
  id,
  option,
  twist,
}: {
  id: string
  /** The option to show, or null before any has been hovered or focused. */
  option: OptionPreview | null
  twist: TwistInfo | null
}) {
  const shown = option?.outcomes.filter((o): o is ShownOutcome => !o.hidden) ?? []
  return (
    <section className="outcomes-panel" aria-label="Outcomes">
      <header className="card-head">
        <h3>Outcomes</h3>
        {twist && (
          <span className="muted small">
            Possible twist: {twist.what} (chance:{' '}
            {twist.chance === null ? '?' : formatPercent(twist.chance)})
          </span>
        )}
      </header>
      <div id={id} className="outcomes-box">
        {!option ? (
          <p className="muted small">Hover or focus an option to see its outcomes.</p>
        ) : (
          <>
            <p className="small outcomes-for">
              <strong>{option.label}</strong>
              {option.check && <span className="muted"> · {option.check.actorName} acts</span>}
            </p>
            {shown.length === 0 ? (
              <p className="muted small">{option.unmet.join(', ') || 'Nothing can happen.'}</p>
            ) : (
              <ul className="outcomes">
                {[...shown].reverse().map((o) => (
                  <li key={o.tier ?? 'fixed'}>
                    {/* The colour names the tier; the name stays in the tooltip and for screen readers. */}
                    <span
                      className={`tier-marker tier-${o.tier ?? 'fixed'}`}
                      title={o.tier ? TIER_LABELS[o.tier] : undefined}
                    >
                      {o.tier && <span className="sr-only">{TIER_LABELS[o.tier]}: </span>}
                    </span>
                    <div>
                      <Branch branch={o} />
                      {o.twist && (
                        <div className="twist small">
                          If {twist?.what ?? 'there is a twist'}: <Branch branch={o.twist} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
