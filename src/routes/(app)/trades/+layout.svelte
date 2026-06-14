<script lang="ts">
	import { onDestroy } from 'svelte';

	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setTradesContext } from '$lib/trades.svelte';

	const pb = getPocketBaseContext();
	const tradesContext = setTradesContext(pb);

	onDestroy(() => {
		tradesContext.dispose();
	});

	let { children } = $props();
</script>

{@render children()}
