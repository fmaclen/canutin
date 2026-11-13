<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		itemsAlignment = 'items-center',
		children
	}: {
		itemsAlignment?: 'items-center' | 'items-start';
		children: Snippet;
	} = $props();
</script>

<div
	class="mx-auto grid max-w-prose grid-cols-1 {itemsAlignment} gap-1.5 md:grid-cols-[1.25fr_3fr] md:gap-4"
>
	{@render children()}
</div>
