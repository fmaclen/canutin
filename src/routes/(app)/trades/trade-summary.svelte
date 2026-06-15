<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getTradesContext } from '$lib/trades.svelte';

	const tradesContext = getTradesContext();

	const netAmount = $derived(
		tradesContext.filteredRows.reduce((total, row) => total + (row.amount ?? 0), 0)
	);
</script>

<div
	role="region"
	aria-label={m.trades_summary_aria_label()}
	class="grid grid-cols-1 gap-2 sm:grid-cols-2"
>
	<KeyValue
		title={m.trades_summary_count_label()}
		value={tradesContext.totalItems}
		variant="outline"
		format="number"
	/>
	<KeyValue title={m.summary_net_amount()} value={netAmount} variant="outline" decimalScale={2} />
</div>
