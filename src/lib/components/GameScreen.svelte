<script lang="ts">
  import { generateCountry } from '../utils/settlement-utils'
  import type { GameState, Player, SettlementGS } from '../types'
  import { capitalize, getRandomValue } from '../utils/general-utils'

  const player: Player = { race: 'human' }
  const country = generateCountry(player, true)
  let gameState: { player: Player } & SettlementGS = {
    player,
    screen: 'settlement',
    map: country.settlements[0],
  }

  function lessHostility() {
    if (gameState.screen === 'settlement') gameState.map.hostility -= 0.01
  }
  function changeTowns() {
    if (gameState.screen === 'settlement') {
      gameState.map = getRandomValue(country.settlements)
      gameState.activeService = undefined
    }
  }

  function enterService(service) {
    if (gameState.screen === 'settlement') gameState.activeService = service
  }
</script>

<h3>Player Character</h3>
<pre>
{Object.entries(player)
    .map(([prop, value]) => `${capitalize(prop)}: ${value}\n`)
    .join('')}
</pre>

<h3>Current Map</h3>
<pre>
{gameState.map.type.name} of {gameState.map.name}

{Object.entries(gameState.map)
    .map(([prop, value]) =>
      !['name', 'type', 'services'].includes(prop) ? `${capitalize(prop)}: ${value}\n` : ''
    )
    .join('')}
</pre>

<div>
  <button on:click={lessHostility}> Decrease hostility </button>
  <button on:click={changeTowns}> Travel </button>
</div>

<div>
  {#if !gameState.activeService}
    {#each gameState.map.services as service}
      <button on:click={() => enterService(service)}> Visit {service.name} </button>
    {/each}
  {/if}

  {#if gameState.activeService}
    {#each gameState.activeService.actions as action}
      <button on:click={() => (gameState = action.handler(gameState))}> {action.label} </button>
    {/each}
  {/if}
</div>
