<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getTradesContext } from '$lib/trades.svelte';
	import { sumPartial } from '$lib/utils';

	const tradesContext = getTradesContext();
	const fx = getExchangeRatesContext();

	const netAmount = $derived.by(() => {
		return sumPartial(
			tradesContext.filteredRows.map((row) => {
				if (row.amount === null) return null;
				const conversion = fx.convert(row.amount, row.securityCurrency, row.date.toISOString());
				return conversion.isUnconverted ? null : conversion.value;
			})
		);
	});
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
	<KeyValue
		title={m.summary_net_amount()}
		value={netAmount.total}
		variant="outline"
		decimalScale={2}
		isPartial={netAmount.isPartial}
	/>
</div>
