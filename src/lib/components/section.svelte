<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<section class="mx-auto flex w-full flex-col space-y-2">
	{@render children?.()}
</section>
