<script lang="ts">
	import { onDestroy } from 'svelte';

	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setSecurityTransactionsContext } from '$lib/security-transactions.svelte';

	const pb = getPocketBaseContext();
	const securityTxContext = setSecurityTransactionsContext(pb);

	onDestroy(() => {
		securityTxContext.dispose();
	});

	let { children } = $props();
</script>

{@render children()}
