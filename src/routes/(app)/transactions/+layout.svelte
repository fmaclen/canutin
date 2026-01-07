<script lang="ts">
	import { onDestroy } from 'svelte';

	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setTransactionsContext } from '$lib/transactions.svelte';

	const pb = getPocketBaseContext();
	const txContext = setTransactionsContext(pb);

	onDestroy(() => {
		txContext.dispose();
	});

	let { children } = $props();
</script>

{@render children()}
