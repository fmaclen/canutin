<script lang="ts">
	import { onDestroy } from 'svelte';

	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setSecurityTransactionsContext } from '$lib/security-transactions.svelte';
	import { setTransactionsContext } from '$lib/transactions.svelte';

	const pb = getPocketBaseContext();
	const txContext = setTransactionsContext(pb);
	const securityTxContext = setSecurityTransactionsContext(pb);

	onDestroy(() => {
		txContext.dispose();
		securityTxContext.dispose();
	});

	let { children } = $props();
</script>

{@render children()}
