<script lang="ts">
	import Number from './number.svelte';
	import { formatCurrency } from './currency';

	interface Props {
		value?: number | null;
		currency?: string;
		locale?: string;
		maximumFractionDigits?: number;
	}

	let { value, currency = 'USD', locale = 'en-US', maximumFractionDigits = 0 }: Props = $props();

	// Format: $1,523.00 || -$1,523.00
	const formattedValue = $derived(
		formatCurrency(value ?? 0, { currency, locale, maximumFractionDigits })
	);
</script>

<Number value={formattedValue} />
