import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { ServicesPanel } from '../town/ServicesPanel'
import { TownLedger } from '../town/TownLedger'
import type { TravelPrefs } from './travelPrefs'

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (placeId: string | null) => void
  /** The pace, foraging and mounts chosen for the roads out (kept by the caller across journeys). */
  prefs: TravelPrefs
  onPrefs: (p: TravelPrefs) => void
  onAction: (a: Action) => void
}

/** The settlement the party is in: the town ledger (design §5) with its services. */
export function PlacePanel(props: Props) {
  return (
    <TownLedger
      {...props}
      services={
        <ServicesPanel content={props.content} state={props.state} onAction={props.onAction} />
      }
    />
  )
}
