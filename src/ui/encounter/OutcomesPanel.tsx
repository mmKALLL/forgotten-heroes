import type {
  BranchPreview,
  OptionPreview,
  ShownOutcome,
  TwistInfo,
} from '../../engine/encounters/preview'
import { formatPercent } from '../../engine/format'
import { useI18n } from '../i18n/I18n'

/**
 * One outcome branch: its story text when shown (outcomeTextShown), then its chips. With the
 * text hidden, a branch with no chips still says something: that the scene moves on, or that
 * nothing comes of it.
 */
function Branch({ branch, showText }: { branch: BranchPreview; showText: boolean }) {
  const { t } = useI18n()
  const escalates = branch.next === 'escalates'
  const bare = !showText && branch.effects.length === 0 && !escalates
  return (
    <>
      {showText && branch.text}
      {branch.effects.map((e) => (
        <span key={e} className="chip">
          {e}
        </span>
      ))}
      {escalates && <span className="chip">{t('outcomes.escalates')}</span>}
      {bare && (
        <span className="muted">
          {t(branch.next === 'stage' ? 'outcomes.movesOn' : 'outcomes.noEffect')}
        </span>
      )}
    </>
  )
}

/**
 * The outcome tiers of the option last hovered or focused, shared by every option card, under
 * them. The box has a minimum height and grows to show every line (no scrolling, no clipping);
 * being below the cards, it never moves them. Each card's choose target points here with aria-describedby. Critical tiers
 * arrive hidden from the engine and get no row: only their odds show, on the card's bar. The
 * story text of each row is hidden unless `showText` (designer call 2026-11-14: no spoilers
 * before choosing; the log tells it after the roll), so a row is usually its chips alone.
 */
export function OutcomesPanel({
  id,
  option,
  twist,
  showText,
}: {
  id: string
  /** The option to show, or null before any has been hovered or focused. */
  option: OptionPreview | null
  twist: TwistInfo | null
  /** Whether the rows show their story text or only their chips (outcomeTextShown). */
  showText: boolean
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
              // Unmet requirements are on the option's card: not repeated here.
              <p className="muted small">{t('outcomes.nothing')}</p>
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
                      <Branch branch={o} showText={showText} />
                      {o.twist && (
                        <div className="twist small">
                          {t('outcomes.if', { what: twist?.what ?? t('outcomes.someTwist') })}
                          <Branch branch={o.twist} showText={showText} />
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
