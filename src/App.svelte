<script lang="ts">
  import svelteLogo from './assets/svelte.svg'
  import GameScreen from './lib/components/GameScreen.svelte'
</script>

<main>
  <div class="left-align">
    <GameScreen />
  </div>

  <p>
    Check out <a href="https://github.com/sveltejs/kit#readme" target="_blank">SvelteKit</a>, the
    official Svelte app framework powered by Vite!
  </p>

  <p class="read-the-docs">Click on the Vite and Svelte logos to learn more</p>
</main>

<style>
  .read-the-docs {
    color: #888;
  }
</style>
