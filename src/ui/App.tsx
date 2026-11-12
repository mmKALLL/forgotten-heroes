import { useState } from 'react'
import { loadBundledContent } from '../content/bundled'
import { formatDate } from '../engine/calendar'
import { suppliesInfo } from '../engine/travel/preview'
import { nodeOf } from '../engine/world/graph'
import { WORLD_MAP_IMAGE, assetUrl } from './assets'
import { CheckPanel } from './CheckPanel'
import { EncounterDeck } from './deck/EncounterDeck'
import { DevArea } from './DevArea'
import { prefersReducedMotion } from './dice/DiceRoll'
import { EncounterView } from './encounter/EncounterView'
import { GoodsBar } from './GoodsBar'
import { addsRoll } from './encounter/rolls'
import { I18nProvider, LanguageToggle, useI18n } from './i18n/I18n'
import { LogPanel } from './LogPanel'
import { NewPartyButton } from './NewPartyButton'
import { PartyPanel } from './PartyPanel'
import { useGame } from './useGame'
import { JourneyPanel } from './world/JourneyPanel'
import { PlacePanel } from './world/PlacePanel'
import { PoiPanel } from './world/PoiPanel'
import { useTravelPrefs } from './world/travelPrefs'
import { WorldMap } from './world/WorldMap'

const content = loadBundledContent()
const mapImage = assetUrl(WORLD_MAP_IMAGE)

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
  // The settlement or site picked on the map or in the roads list (UI state only).
  const [selected, setSelected] = useState<string | null>(null)
  // The pace and foraging chosen for the roads out: kept across journeys, reset by a new party.
  const [travelPrefs, setTravelPrefs] = useTravelPrefs(state.seed)
  const rolling = revealed !== state && !reducedMotion && addsRoll(revealed, state)
  if (!rolling && revealed !== state) setRevealed(state)
  const shown = rolling ? revealed : state
  const supplies = suppliesInfo(shown)
  const atSite = shown.location !== null && nodeOf(shown, content, shown.location)?.kind === 'poi'
  // The town ledger takes a wider centre column (theme.css), so a settlement fits one screen.
  const inTown = !state.encounter && !shown.travel && !atSite
  return (
    <div className="app">
      <header className="topbar">
        <h1>{t('app.title')}</h1>
        <span title={formatDate(shown.day)}>{t('top.day', { day: shown.day })}</span>
        <span>{t('top.gold', { gold: shown.gold })}</span>
        <span title={t('top.suppliesHint')}>
          {t('top.food', { food: supplies.food, days: supplies.foodDays })} ·{' '}
          {t('top.water', { water: supplies.water, capacity: supplies.waterCapacity })}
        </span>
        <span title={t('top.inspirationHint')}>
          {t('top.inspiration', { n: shown.inspiration })}
        </span>
        <span className="spacer" />
        <span className="muted small">{t('top.seed', { seed: state.seed })}</span>
        <LanguageToggle />
        <NewPartyButton
          onStart={(mode) => {
            setSelected(null)
            restart(mode)
          }}
        />
      </header>
      <main className={inTown ? 'layout town' : 'layout'}>
        {/* On narrow screens the columns stack: party, then the centre, then the map (theme.css). */}
        <div className="left">
          <PartyPanel party={shown.party} skillUses={shown.skillUses} day={shown.day} />
          <WorldMap
            content={content}
            state={shown}
            selected={selected}
            onSelect={(id) => setSelected(id === selected ? null : id)}
            imageUrl={mapImage}
          />
        </div>
        <div className="centre">
          {state.encounter ? (
            <EncounterView
              state={state}
              onAction={dispatch}
              onRevealed={() => setRevealed(state)}
            />
          ) : shown.travel ? (
            <JourneyPanel content={content} state={shown} onAction={dispatch} />
          ) : atSite ? (
            <PoiPanel
              content={content}
              state={shown}
              selected={selected}
              onSelect={setSelected}
              prefs={travelPrefs}
              onPrefs={setTravelPrefs}
              onAction={dispatch}
            />
          ) : (
            <PlacePanel
              content={content}
              state={shown}
              selected={selected}
              onSelect={setSelected}
              prefs={travelPrefs}
              onPrefs={setTravelPrefs}
              onAction={dispatch}
            />
          )}
        </div>
        <div className="side">
          <LogPanel log={shown.log} />
          <DevArea>
            <EncounterDeck content={content} state={shown} rolling={rolling} onAction={dispatch} />
            <CheckPanel state={state} onAction={dispatch} />
          </DevArea>
        </div>
      </main>
      <GoodsBar content={content} state={shown} />
    </div>
  )
}
