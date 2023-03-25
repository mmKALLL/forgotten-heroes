<script lang="ts">
  import { formatSettlementName, generateCountry } from '../utils/settlement-utils'
  import { capitalize, distance, getRandomValue, pick, randomInt } from '../utils/general-utils'
  import { generateCharacter } from '../utils/character-utils'
  import type { GameState, Player, SettlementGS, TravelGS } from '../types'
  import { generateSettlementServiceActions } from '../utils/data-utils'
  import { generateItemDescription } from '../utils/item-utils'

  const player: Player = {
    gold: randomInt(20, 50),
    leader: generateCharacter(),
    followers: [],
    inventory: [],
  }
  const country = generateCountry(player, true)
  let gameState: GameState = {
    player,
    gameLog: [
      `Your journey starts at the ${formatSettlementName(
        country.settlements[0]
      )}. Where do you want to go?`,
    ],
    screen: 'settlement',
    map: country.settlements[0],
  }

  let renderState = {
    activeDescText: null,
  }

  function lessFriendliness() {
    if (gameState.screen === 'settlement') gameState.map.friendliness -= 0.01
  }
  function changeTowns() {
    if (gameState.screen === 'settlement') {
      const destination = getRandomValue(
        country.settlements.filter(
          (s) => gameState.screen === 'settlement' && s.name !== gameState.map.name
        )
      )
      // TODO: Why is undefined accepted for currentEncounter here???
      const travelGS: TravelGS = {
        ...pick(gameState, 'player', 'gameLog'),
        screen: 'travel',
        destination,
        currentEncounter: undefined,
        encountersLeft: randomInt(0, Math.log10(distance(gameState.map, destination)) + 1),
        encounterFriendlinessModifier: (gameState.map.friendliness + destination.friendliness) / 2,
      }
      gameState = travelGS
    }
  }

  function enterService(service) {
    if (gameState.screen === 'settlement') gameState.activeService = service
  }
</script>

<div style="display: flex;">
  <div
    style="max-width: 50%; display: flex; flex-direction:column; margin-right: 1em; white-space: pre-wrap;"
  >
    <h3 style="display:inline-block ">Player Character</h3>
    <pre>{`Gold: ${gameState.player.gold}\n` +
        Object.entries(gameState.player.leader)
          .map(
            ([prop, value]) =>
              `${['maxHp'].includes(prop) ? '' : `${capitalize(prop)}: `}` +
              `${prop === 'buffs' ? JSON.stringify(value) : value}` +
              `${
                ['str', 'dex', 'vit', 'int', 'wis'].includes(prop)
                  ? ', '
                  : prop === 'hp'
                  ? '/'
                  : '\n'
              }`
          )
          .join('')}
    </pre>
  </div>
  <div
    style="max-width: 50%; min-width: 30%; display: flex; flex-direction:column; margin-right: 1em; white-space: pre-wrap;"
  >
    <h3>Inventory</h3>
    <pre>{#each gameState.player.inventory as item}
        {item.heldQuantity}x {item.name} - {generateItemDescription(item)}<br />
      {/each}
  </pre>
  </div>
</div>

{#if gameState.screen === 'settlement'}
  <h3>Current Map</h3>
  <pre>
{formatSettlementName(gameState.map)}

{Object.entries(gameState.map)
      .map(([prop, value]) =>
        !['name', 'type', 'services'].includes(prop) ? `${capitalize(prop)}: ${value}\n` : ''
      )
      .join('')}
</pre>

  <div>
    <button on:click={lessFriendliness}> Decrease friendliness </button>
    <button on:click={changeTowns}> Travel </button>
  </div>

  <div>
    {#if !gameState.activeService}
      {#each gameState.map.services as service}
        <button on:click={() => enterService(service)}> Visit {service.name} </button>
      {/each}
    {/if}
    {#if gameState.activeService}
      {#each generateSettlementServiceActions(gameState.activeService) as action}
        <button
          on:mouseenter={() => {
            renderState.activeDescText = action.description
          }}
          on:mouseleave={() => {
            renderState.activeDescText = null
          }}
          on:click={() => {
            gameState = action.handler(gameState)
            renderState.activeDescText = null
          }}
        >
          {action.label}
        </button>
      {/each}
    {/if}
  </div>
{/if}

{#if gameState.screen === 'travel'}
  <div>
    On the way to {gameState.destination.name}...
    {#each Object.entries(pick(gameState, 'encounterFriendlinessModifier')) as entry}
      {entry}
    {/each}
  </div>
  <div>
    {#if gameState.encountersLeft > 0}
      <button>Next encounter</button>
    {/if}
    {#if gameState.encountersLeft === 0}
      <button>Enter destination</button>
    {/if}
  </div>
{/if}

<div style="min-height: 3em">{renderState.activeDescText ?? 'No description'}</div>

<div>
  {#each Object.values(gameState.gameLog) as logEntry}
    <div>{logEntry}</div>
  {/each}
</div>
