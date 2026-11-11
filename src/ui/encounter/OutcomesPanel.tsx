import type {
  BranchPreview,
  OptionPreview,
  ShownOutcome,
  TwistInfo,
} from '../../engine/encounters/preview'
import { formatPercent } from '../../engine/format'
import { useI18n } from '../i18n/I18n'

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
  const { t, tier: tierName } = useI18n()
  const shown = option?.outcomes.filter((o): o is ShownOutcome => !o.hidden) ?? []
  return (
    <section className="outcomes-panel" aria-label={t('outcomes.heading')}>
      <header className="card-head">
        <h3>{t('outcomes.heading')}</h3>
        {twist && (
          <span className="muted small">
            {t('outcomes.twist', {
              what: twist.what,
              chance: twist.chance === null ? '?' : formatPercent(twist.chance),
            })}
          </span>
        )}
      </header>
      <div id={id} className="outcomes-box">
        {!option ? (
          <p className="muted small">{t('outcomes.hint')}</p>
        ) : (
          <>
            <p className="small outcomes-for">
              <strong>{option.label}</strong>
              {option.check && (
                <span className="muted">
                  {t('outcomes.acts', { name: option.check.actorName })}
                </span>
              )}
            </p>
            {shown.length === 0 ? (
              <p className="muted small">{option.unmet.join(', ') || t('outcomes.nothing')}</p>
            ) : (
              <ul className="outcomes">
                {[...shown].reverse().map((o) => (
                  <li key={o.tier ?? 'fixed'}>
                    {/* The colour names the tier; the name stays in the tooltip and for screen readers. */}
                    <span
                      className={`tier-marker tier-${o.tier ?? 'fixed'}`}
                      title={o.tier ? tierName(o.tier) : undefined}
                    >
                      {o.tier && <span className="sr-only">{tierName(o.tier)}: </span>}
                    </span>
                    <div>
                      <Branch branch={o} />
                      {o.twist && (
                        <div className="twist small">
                          {t('outcomes.if', { what: twist?.what ?? t('outcomes.someTwist') })}
                          <Branch branch={o.twist} />
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
