<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		itemsAlignment = 'items-center',
		children
	}: {
		itemsAlignment?: 'items-center' | 'items-start';
		children: Snippet;
	} = $props();

	const gapClass = itemsAlignment === 'items-start' ? 'gap-4' : 'gap-2';
</script>

<div
	class="mx-auto grid max-w-prose grid-cols-1 {itemsAlignment} {gapClass} md:grid-cols-[1.25fr_3fr] md:gap-4"
>
	{@render children()}
</div>
