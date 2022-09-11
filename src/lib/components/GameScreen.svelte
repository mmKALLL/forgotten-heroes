<script lang="ts">
  import { generateCountry } from '../utils/settlement-utils'
  import { capitalize, getRandomValue, randomInt } from '../utils/general-utils'
  import { generateCharacter } from '../utils/character-utils'
  import type { Player, SettlementGS } from '../types'
  import { generateSettlementServiceActions } from '../utils/data-utils'

  const player: Player = {
    gold: randomInt(0, 50),
    leader: generateCharacter(),
    followers: [],
    inventory: [],
  }
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
{`Gold: ${gameState.player.gold}`}
{Object.entries(player.leader)
    .map(
      ([prop, value]) =>
        `${['maxHp'].includes(prop) ? '' : `${capitalize(prop)}: `}` +
        `${prop === 'buffs' ? JSON.stringify(value) : value}` +
        `${['str', 'dex', 'vit', 'int', 'wis'].includes(prop) ? ', ' : prop === 'hp' ? '/' : '\n'}`
    )
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
  <!-- TODO: Add haggling with intimidation (str), evaluation (wis), or negotiation (cha). Potential risk to get copped / sour relations. -->
  {#if gameState.activeService}
    {#each generateSettlementServiceActions(gameState.activeService) as action}
      <button on:click={() => (gameState = action.handler(gameState))}> {action.label} </button>
    {/each}
  {/if}
</div>
