<script lang="ts">
	import Currency from '$lib/components/currency.svelte';

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
		format?: 'currency' | 'number';
		decimalScale?: number;
	} = $props();

	const variantClasses: Record<Variant, string> = {
		filled: 'shadow-md bg-background',
		outline: 'border border-border bg-transparent',
		cash: 'shadow-md bg-cash text-background',
		debt: 'shadow-md bg-debt text-background',
		investment: 'shadow-md bg-investment text-background',
		other: 'shadow-md bg-other-assets text-background'
	};
</script>

<div
	class="flex items-center justify-between rounded-sm px-4 py-3.5 {variantClasses[variant]}"
	role="region"
	aria-label={title}
>
	<div class="text-sm font-semibold tracking-tight text-balance">{title}</div>
	<div class="font-mono text-lg tabular-nums">
		{#if format === 'number'}
			{value ?? 0}
		{:else}
			<Currency value={value ?? 0} {decimalScale} />
		{/if}
	</div>
</div>
