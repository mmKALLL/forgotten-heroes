import { useEffect, useRef, useState } from 'react'
import { loadBundledContent } from '../content/bundled'
import { inProgress } from '../engine/encounters/run'
import { FINAL_ENDINGS, runEnding, runRecord } from '../engine/crisis/ending'
import { crisisInfo } from '../engine/crisis/status'
import { camaraderieInfo } from '../engine/town/camaraderie'
import { suppliesInfo } from '../engine/travel/preview'
import { dangerInfo } from '../engine/world/danger'
import { nodeOf } from '../engine/world/graph'
import { WORLD_MAP_IMAGE, assetUrl } from './assets'
import { CheckPanel } from './CheckPanel'
import { ContractsPanel } from './ContractsPanel'
import { CrisisTracker } from './CrisisPanel'
import { EncounterDeck } from './deck/EncounterDeck'
import { DevArea } from './DevArea'
import { EndDialog } from './EndDialog'
import { prefersReducedMotion } from './dice/DiceRoll'
import { EncounterView } from './encounter/EncounterView'
import { GoodsBar } from './GoodsBar'
import { recordRun } from './hall'
import { addsRoll } from './encounter/rolls'
import { I18nProvider, LanguageToggle, useI18n } from './i18n/I18n'
import { LogPanel } from './LogPanel'
import { PartyPanel } from './PartyPanel'
import { SavesMenu } from './SavesMenu'
import { DayMark } from './DayMark'
import { useAutoRest } from './settings'
import { useGame } from './useGame'
import { JourneyPanel } from './world/JourneyPanel'
import { PlacePanel } from './world/PlacePanel'
import { PoiPanel } from './world/PoiPanel'
import { DelveView } from './world/DelveView'
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
  const { state, slot, dispatch, restart, continueIn } = useGame(content)
  // While a new roll animates, the journal, party and top bar keep showing the last revealed
  // state, so they don't give the result away. A reload starts from the current state.
  const [revealed, setRevealed] = useState(state)
  const [reducedMotion] = useState(prefersReducedMotion)
  // The settlement or site picked on the map or in the roads list (UI state only).
  const [selected, setSelected] = useState<string | null>(null)
  // The pace and foraging chosen for the roads out: kept across journeys, reset by a new party.
  const [travelPrefs, setTravelPrefs] = useTravelPrefs(state.seed)
  // Auto-rest on arrival (per viewer): the engine rests only if someone is hurt or strained.
  const [autoRest, setAutoRest] = useAutoRest()
  // Which run (slot and world) the last state belonged to: switching runs is not an arrival.
  const run = `${slot}:${state.seed}`
  const wasTravelling = useRef({ run, travelling: state.travel !== null })
  useEffect(() => {
    const before = wasTravelling.current
    const arrived =
      before.run === run && before.travelling && state.travel === null && !state.encounter
    wasTravelling.current = { run, travelling: state.travel !== null }
    if (arrived && autoRest) dispatch({ type: 'autoRest' })
  }, [state, run, autoRest, dispatch])
  // The Hall of the Fallen records each ending once (a run that ends again is updated in place).
  const ending = runEnding(state)
  const recorded = useRef<string | null>(null)
  useEffect(() => {
    const key = `${state.seed}:${ending}`
    if (!ending || recorded.current === key) return
    recorded.current = key
    recordRun(runRecord(state, content, new Date().toISOString()))
  }, [state, ending])
  // "Look back" closes the fallen screen for this session (per run).
  const [lookedBack, setLookedBack] = useState<string | null>(null)
  const rolling = revealed !== state && !reducedMotion && addsRoll(revealed, state)
  if (!rolling && revealed !== state) setRevealed(state)
  const shown = rolling ? revealed : state
  const supplies = suppliesInfo(shown)
  const atSite = shown.location !== null && nodeOf(shown, content, shown.location)?.kind === 'poi'
  // The town ledger takes a wider centre column (theme.css), so a settlement fits one screen.
  const inTown = !state.encounter && !shown.travel && !atSite
  const crisis = crisisInfo(shown, content)
  // Fallen or disbanded: the run is over for good.
  const shownEnding = runEnding(shown)
  const final = shownEnding !== null && FINAL_ENDINGS.includes(shownEnding) ? shownEnding : null
  // The end screen: a final ending at once; a won or lost Crisis once the encounter that decided it closes.
  const endScreen = final
    ? lookedBack === run
      ? null
      : final
    : crisis?.showEnd && !shown.encounter
      ? crisis.ended!.outcome
      : null
  const newParty = () => {
    setSelected(null)
    restart(slot)
  }
  return (
    <div className="app">
      <header className="topbar">
        <h1>{t('app.title')}</h1>
        <DayMark day={shown.day} crisis={crisis} danger={dangerInfo(shown, content)} />
        <span>{t('top.gold', { gold: shown.gold })}</span>
        <span title={t('top.suppliesHint')}>
          {t('top.food', { food: supplies.food, days: supplies.foodDays })} ·{' '}
          {t('top.water', {
            water: supplies.water,
            capacity: supplies.waterCapacity,
            days: supplies.waterDays,
          })}
        </span>
        <span title={t('top.inspirationHint')}>
          {t('top.inspiration', { n: shown.inspiration })}
        </span>
        <span className="spacer" />
        <span className="muted small">{t('top.seed', { seed: state.seed })}</span>
        <LanguageToggle />
        <SavesMenu
          content={content}
          state={state}
          slot={slot}
          onContinue={(n) => {
            setSelected(null)
            continueIn(n)
          }}
          onNewParty={(n) => {
            setSelected(null)
            restart(n)
          }}
        />
      </header>
      {final && (
        <div className="fallen-banner" role="status">
          <span>{t(final === 'disbanded' ? 'end.disbandedBanner' : 'end.fallenBanner')}</span>
          <button className="primary" onClick={newParty}>
            {t('end.newParty')}
          </button>
        </div>
      )}
      <main className={inTown ? 'layout town' : 'layout'}>
        {/* On narrow screens the columns stack: party, then the centre, then the map (theme.css). */}
        <div className="left">
          <PartyPanel
            party={shown.party}
            skillUses={shown.skillUses}
            day={shown.day}
            camaraderie={camaraderieInfo(shown)}
            gear={shown.gear}
            onAction={inProgress(state) ? undefined : dispatch}
          />
          <ContractsPanel content={content} state={shown} onAction={dispatch} />
          <WorldMap
            content={content}
            state={shown}
            selected={selected}
            onSelect={(id) => setSelected(id === selected ? null : id)}
            imageUrl={mapImage}
            prefs={travelPrefs}
            onTravel={(a) => {
              dispatch(a)
              setSelected(null)
            }}
            onClose={() => setSelected(null)}
          />
        </div>
        <div className="centre">
          {shown.delve ? (
            // A delve (Plan 6 D4): the dungeon's map, then the room being played.
            <>
              <DelveView content={content} state={shown} onAction={dispatch} />
              {state.encounter && (
                <EncounterView
                  state={state}
                  onAction={dispatch}
                  onRevealed={() => setRevealed(state)}
                />
              )}
            </>
          ) : state.encounter ? (
            <EncounterView
              state={state}
              onAction={dispatch}
              onRevealed={() => setRevealed(state)}
            />
          ) : shown.travel ? (
            <JourneyPanel
              content={content}
              state={shown}
              onAction={dispatch}
              autoRest={{ on: autoRest, set: setAutoRest }}
            />
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
          <CrisisTracker content={content} state={shown} />
          <DevArea>
            <EncounterDeck content={content} state={shown} rolling={rolling} onAction={dispatch} />
            <CheckPanel state={state} onAction={dispatch} />
          </DevArea>
        </div>
      </main>
      <GoodsBar content={content} state={shown} onAction={dispatch} />
      {endScreen && (
        <EndDialog
          key={`${run}:${endScreen}`}
          content={content}
          state={shown}
          ending={endScreen}
          onKeepPlaying={() => dispatch({ type: 'acknowledgeEnd' })}
          onNewParty={newParty}
          onLookBack={() => setLookedBack(run)}
        />
      )}
    </div>
  )
}
