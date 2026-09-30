<script lang="ts">
  import { onMount } from 'svelte'
  import { listTasks, type Task } from './lib/api'

  let tasks = $state<Task[] | null>(null)

  onMount(() => {
    listTasks()
      .then((loaded) => {
        tasks = loaded
      })
      .catch(() => {
        // The load-failure UI arrives later; until then the list stays hidden.
      })
  })
</script>

<header>
  <h1>Todo</h1>
</header>

<main>
  <label for="new-task" class="visually-hidden">New task</label>
  <input
    id="new-task"
    type="text"
    placeholder="What needs doing?"
    autocomplete="off"
    enterkeyhint="enter"
  />

  {#if tasks !== null}
    {#if tasks.length === 0}
      <p>Nothing waiting. Type a task above and press Enter.</p>
    {:else}
      <ul aria-label="Tasks">
        {#each tasks as task (task.id)}
          <li>{task.text}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
