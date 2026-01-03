<script lang="ts">
	import { formatCurrency } from './currency';
	import Number from './number.svelte';

	type Sentiment = 'positive' | 'negative' | 'neutral' | 'undefined';

	interface Props {
		value: number;
		decimalScale?: number;
		sentiment?: Sentiment;
	}

	let { value, decimalScale = 0, sentiment = 'undefined' }: Props = $props();

	const formattedValue = $derived.by(() => formatCurrency(value, decimalScale));
</script>

<Number value={formattedValue} {sentiment} />
