<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();
</script>

<div
	role="region"
	aria-label={m.transactions_summary_aria_label()}
	class="grid grid-cols-1 gap-2 sm:grid-cols-2"
>
	<KeyValue
		title={m.transactions_summary_count_label()}
		value={txContext.totalItems}
		variant="outline"
		format="number"
	/>
	<KeyValue
		title={m.summary_net_balance()}
		value={txContext.netBalance}
		variant="outline"
		decimalScale={2}
	/>
</div>
