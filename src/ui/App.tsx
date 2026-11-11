import { useState } from 'react'
import { loadBundledContent } from '../content/bundled'
import { CheckPanel } from './CheckPanel'
import { EncounterDeck } from './deck/EncounterDeck'
import { prefersReducedMotion } from './dice/DiceRoll'
import { EncounterView } from './encounter/EncounterView'
import { addsRoll } from './encounter/rolls'
import { I18nProvider, LanguageToggle, useI18n } from './i18n/I18n'
import { LogPanel } from './LogPanel'
import { PartyPanel } from './PartyPanel'
import { useGame } from './useGame'

const content = loadBundledContent()

export function App() {
  return (
    <I18nProvider content={content}>
      <Game />
    </I18nProvider>
  )
}

function Game() {
  const { t } = useI18n()
  const { state, dispatch, restart } = useGame(content)
  // While a new roll animates, the journal, party and top bar keep showing the last revealed
  // state, so they don't give the result away. A reload starts from the current state.
  const [revealed, setRevealed] = useState(state)
  const [reducedMotion] = useState(prefersReducedMotion)
  const rolling = revealed !== state && !reducedMotion && addsRoll(revealed, state)
  if (!rolling && revealed !== state) setRevealed(state)
  const shown = rolling ? revealed : state
  return (
    <div className="app">
      <header className="topbar">
        <h1>{t('app.title')}</h1>
        <span>{t('top.day', { day: shown.day })}</span>
        <span>{t('top.gold', { gold: shown.gold })}</span>
        <span title={t('top.inspirationHint')}>
          {t('top.inspiration', { n: shown.inspiration })}
        </span>
        <span className="spacer" />
        <span className="muted small">{t('top.seed', { seed: state.seed })}</span>
        <LanguageToggle />
        <button onClick={restart}>{t('top.newParty')}</button>
      </header>
      <main className="layout">
        <PartyPanel party={shown.party} skillUses={shown.skillUses} day={shown.day} />
        {state.encounter ? (
          <EncounterView state={state} onAction={dispatch} onRevealed={() => setRevealed(state)} />
        ) : (
          <CheckPanel state={state} onAction={dispatch} />
        )}
        <div className="side">
          <EncounterDeck content={content} state={shown} rolling={rolling} onAction={dispatch} />
          <LogPanel log={shown.log} />
        </div>
      </main>
    </div>
  )
}
