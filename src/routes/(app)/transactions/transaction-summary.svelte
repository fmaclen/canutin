<script lang="ts">
	import Currency from '$lib/components/currency.svelte';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();
</script>

<div role="region" aria-label="Transactions summary">
	<div>
		<span>Transactions</span>
		<span>{txContext.filteredRows.length}</span>
	</div>
	<div>
		<span>Net balance</span>
		<Currency value={txContext.netBalance} maximumFractionDigits={2} />
	</div>
</div>
