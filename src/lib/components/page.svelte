<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-col space-y-8 p-8">
	{@render children?.()}
</div>
