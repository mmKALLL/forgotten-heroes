import { loadBundledContent } from '../content/bundled'
import { CheckPanel } from './CheckPanel'
import { LogPanel } from './LogPanel'
import { PartyPanel } from './PartyPanel'
import { useGame } from './useGame'

const content = loadBundledContent()

export function App() {
  const { state, dispatch, restart } = useGame(content)
  return (
    <div className="app">
      <header className="topbar">
        <h1>Forgotten Heroes</h1>
        <span>Day {state.day}</span>
        <span>{state.gold} gp</span>
        <span title="Gained from natural 20s; spend for rerolls (coming soon)">✦ {state.inspiration} inspiration</span>
        <span className="spacer" />
        <span className="muted small">seed {state.seed}</span>
        <button onClick={restart}>New party</button>
      </header>
      <main className="layout">
        <PartyPanel party={state.party} />
        <CheckPanel state={state} onAction={dispatch} />
        <LogPanel log={state.log} />
      </main>
    </div>
  )
}
