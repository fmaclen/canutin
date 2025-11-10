<script lang="ts">
	import { formatCurrency } from './currency';
	import Number from './number.svelte';

	type Sentiment = 'positive' | 'negative' | 'neutral' | 'undefined';

	interface Props {
		value: number;
		currency?: string;
		locale?: string;
		maximumFractionDigits?: number;
		sentiment?: Sentiment;
	}

	let {
		value,
		currency = 'USD',
		locale = 'en-US',
		maximumFractionDigits = 0,
		sentiment = 'undefined'
	}: Props = $props();

	// Format: $1,523.00 || -$1,523.00
	const formattedValue = $derived(
		formatCurrency(value, { currency, locale, maximumFractionDigits })
	);
</script>

<Number value={formattedValue} {sentiment} />
