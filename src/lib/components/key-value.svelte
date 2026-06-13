<script lang="ts">
	import Currency from '$lib/components/currency.svelte';
	import Number from '$lib/components/number.svelte';

	type Variant = 'filled' | 'outline' | 'cash' | 'debt' | 'investment' | 'other';

	let {
		title = '',
		value = null,
		variant = 'filled',
		format = 'currency',
		decimalScale = 0
	}: {
		title: string;
		value: number | null;
		variant?: Variant;
		format?: 'currency' | 'number' | 'percent';
		decimalScale?: number;
	} = $props();

	const variantClasses: Record<Variant, string> = {
		filled: 'shadow-md bg-background',
		outline: 'border border-border bg-transparent',
		cash: 'shadow-md bg-cash text-white',
		debt: 'shadow-md bg-debt text-white',
		investment: 'shadow-md bg-investment text-white',
		other: 'shadow-md bg-other-assets text-white'
	};
</script>

<div
	class="flex items-center justify-between rounded-sm px-4 py-3.5 {variantClasses[variant]}"
	role="region"
	aria-label={title}
>
	<div class="text-sm font-semibold tracking-tight text-balance">{title}</div>
	<div class="font-mono text-lg tabular-nums">
		{#if value === null}
			<span class="text-muted-foreground">~</span>
		{:else if format === 'percent'}
			<Number value={`${value > 0 ? '+' : ''}${value.toFixed(1)}%`} />
		{:else if format === 'number'}
			<Number {value} />
		{:else}
			<Currency {value} {decimalScale} />
		{/if}
	</div>
</div>
