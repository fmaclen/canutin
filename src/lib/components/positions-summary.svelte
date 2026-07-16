<script lang="ts">
	import KeyValue from '$lib/components/key-value.svelte';
	import { m } from '$lib/paraglide/messages';
	import { gainLossPercentOrNull } from '$lib/security-balance-values';
	import { sumPartial } from '$lib/utils';

	let {
		rows,
		ariaLabel
	}: {
		rows: Array<{
			value: number | null;
			gainLoss: number | null;
			costBasis: number | null;
			isUnconverted: boolean;
		}>;
		ariaLabel?: string;
	} = $props();

	const marketValueTotal = $derived(
		sumPartial(rows.map((row) => (row.isUnconverted ? null : row.value)))
	);
	const gainLossTotal = $derived(
		sumPartial(rows.map((row) => (row.isUnconverted ? null : row.gainLoss)))
	);
	const costBasisTotal = $derived(
		sumPartial(rows.map((row) => (row.isUnconverted ? null : row.costBasis)))
	);
	const gainPercent = $derived(gainLossPercentOrNull(gainLossTotal.total, costBasisTotal.total));
</script>

<div
	role={ariaLabel ? 'region' : undefined}
	aria-label={ariaLabel}
	class="grid grid-cols-1 gap-2 sm:grid-cols-3"
>
	<KeyValue
		title={m.summary_net_gain_loss()}
		value={gainLossTotal.total}
		variant="outline"
		decimalScale={2}
		isPartial={gainLossTotal.isPartial}
	/>
	<KeyValue
		title={m.summary_net_gain_percent()}
		value={gainPercent}
		variant="outline"
		format="percent"
		isPartial={gainLossTotal.isPartial || costBasisTotal.isPartial}
	/>
	<KeyValue
		title={m.summary_net_market_value()}
		value={marketValueTotal.total}
		variant="outline"
		decimalScale={2}
		isPartial={marketValueTotal.isPartial}
	/>
</div>
