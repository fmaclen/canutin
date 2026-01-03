<script lang="ts">
	import Currency from '$lib/components/currency.svelte';

	let {
		title = '',
		value = null,
		variant = 'filled',
		format = 'currency',
		className
	}: {
		title: string;
		value: number | null;
		variant?: 'filled' | 'outline';
		format?: 'currency' | 'number';
		className?: string;
	} = $props();

	const baseClasses = 'flex items-center justify-between rounded-sm px-4 py-3.5';
	const variantClasses =
		variant === 'outline'
			? 'border border-border bg-transparent'
			: `shadow-md ${className ?? 'bg-background'}`;
</script>

<div class="{baseClasses} {variantClasses}" role="region" aria-label={title}>
	<div class="text-sm font-semibold tracking-tight text-balance">{title}</div>
	<div class="font-mono text-sm tabular-nums">
		{#if format === 'number'}
			{value ?? 0}
		{:else}
			<Currency value={value ?? 0} />
		{/if}
	</div>
</div>
