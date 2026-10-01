<script lang="ts">
  // The only aria-live owner in the app (AD-17). Both regions exist, empty, from first paint.
  import { toasts } from '../lib/toasts.svelte'
</script>

<div class="visually-hidden" role="status" aria-live="polite">{toasts.politeText}</div>
<div class="visually-hidden" role="alert">{toasts.alertText}</div>
