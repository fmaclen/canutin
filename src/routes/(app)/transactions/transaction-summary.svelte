<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();
</script>

<div role="region" aria-label="Transactions summary" class="grid grid-cols-2 gap-2">
	<KeyValue
		title="Transactions"
		value={txContext.filteredRows.length}
		variant="outline"
		format="number"
	/>
	<KeyValue title="Net balance" value={txContext.netBalance} variant="outline" />
</div>
