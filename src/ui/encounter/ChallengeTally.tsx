import type { ChallengePreview } from '../../engine/encounters/preview'
import { formatPercent } from '../../engine/format'
import { useI18n } from '../i18n/I18n'

/** n marks, `filled` of them filled: e.g. ●●○○. */
const pips = (filled: number, of: number, on: string, off: string) =>
  Array.from({ length: of }, (_, i) => (i < filled ? on : off)).join('')

/**
 * A skill challenge's tally (Plan 6 S): successes and failures so far against what wins and
 * loses it, and the chance of winning with the best choice each round. What each tier marks is
 * on the outcome rows; only the hidden critical tiers' rule is said here.
 */
export function ChallengeTally({ challenge }: { challenge: ChallengePreview }) {
  const { t } = useI18n()
  const { tally, need } = challenge
  const successes = Math.min(tally.successes, need.successes)
  const failures = Math.min(tally.failures, need.failures)
  return (
    <section className="challenge-tally" aria-label={t('challenge.heading')}>
      <span className="challenge-successes">
        {t('challenge.successes')}{' '}
        <span aria-hidden="true">{pips(successes, need.successes, '●', '○')}</span>
        <span className="sr-only">{t('challenge.of', { n: successes, of: need.successes })}</span>
      </span>
      <span className="challenge-failures">
        {t('challenge.failures')}{' '}
        <span aria-hidden="true">{pips(failures, need.failures, '✕', '○')}</span>
        <span className="sr-only">{t('challenge.of', { n: failures, of: need.failures })}</span>
      </span>
      <span className="challenge-chance">
        {t('challenge.chance', { percent: formatPercent(challenge.chance) })}
      </span>
      <span className="muted small challenge-rule">{t('challenge.rule')}</span>
    </section>
  )
}
