<script lang="ts">
	import { formatCurrency } from './currency';
	import Number from './number.svelte';

	type Sentiment = 'positive' | 'negative' | 'neutral' | 'undefined';

	interface Props {
		value: number;
		currency?: string;
		locale?: string;
		maximumFractionDigits?: number;
		decimalScale?: number;
		sentiment?: Sentiment;
	}

	let {
		value,
		currency = 'USD',
		locale = 'en-US',
		maximumFractionDigits = 0,
		decimalScale,
		sentiment = 'undefined'
	}: Props = $props();

	const formattedValue = $derived(
		formatCurrency(value, {
			currency,
			locale,
			maximumFractionDigits: decimalScale ?? maximumFractionDigits
		})
	);
</script>

<Number value={formattedValue} {sentiment} />
