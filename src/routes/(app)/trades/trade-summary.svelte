<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getTradesContext } from '$lib/trades.svelte';

	const tradesContext = getTradesContext();
	const fx = getExchangeRatesContext();

	const netAmount = $derived.by(() => {
		let sum = 0;
		let isUnconverted = false;
		for (const row of tradesContext.filteredRows) {
			if (row.amount === null) continue;
			const conversion = fx.convert(row.amount, row.securityCurrency, row.date.toISOString());
			isUnconverted ||= conversion.isUnconverted;
			if (!conversion.isUnconverted) sum += conversion.value;
		}
		return { value: sum, isUnconverted };
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
		value={netAmount.value}
		variant="outline"
		decimalScale={2}
		isUnconverted={netAmount.isUnconverted}
	/>
</div>
