<script lang="ts">
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setTransactionsContext } from '$lib/transactions.svelte';

	const pb = getPocketBaseContext();
	setTransactionsContext(pb);

	let { children } = $props();
</script>

{@render children()}
