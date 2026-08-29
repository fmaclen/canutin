<script lang="ts">
	import Currency from '$lib/components/currency.svelte';
	import Number from '$lib/components/number.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import { formatPercent } from '$lib/utils';

	type Variant = 'filled' | 'outline' | 'cash' | 'debt' | 'investment' | 'other';

	let {
		title = '',
		value = null,
		variant = 'filled',
		format = 'currency',
		decimalScale = 0,
		isUnconverted = false,
		isPartial = false
	}: {
		title: string;
		value: number | null;
		variant?: Variant;
		format?: 'currency' | 'number' | 'percent';
		decimalScale?: number;
		isUnconverted?: boolean;
		isPartial?: boolean;
	} = $props();

	const variantClasses: Record<Variant, string> = {
		filled: 'shadow-md bg-background',
		outline: 'border border-border bg-transparent',
		cash: 'shadow-md bg-cash text-white',
		debt: 'shadow-md bg-debt text-white',
		investment: 'shadow-md bg-investment text-white',
		other: 'shadow-md bg-other-assets text-white'
	};

	const onColoredSurface = $derived(
		variant === 'cash' || variant === 'debt' || variant === 'investment' || variant === 'other'
	);
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
			{#if isPartial}
				<Tooltip.Root>
					<Tooltip.Trigger
						aria-label={m.fx_partial_total()}
						class="{onColoredSurface
							? 'border-white/66 text-white'
							: 'text-muted-foreground border-border'} inline-flex items-baseline gap-1 border-b border-dashed leading-none hover:border-current"
					>
						<span class={onColoredSurface ? 'text-white/70' : 'text-muted-foreground'}>~</span>
						<Number value={formatPercent(value)} />
					</Tooltip.Trigger>
					<Tooltip.Content sideOffset={6}>
						<p class="text-xs leading-snug font-normal">{m.fx_partial_total()}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<Number value={formatPercent(value)} />
			{/if}
		{:else if format === 'number'}
			<Number value={value.toLocaleString(getFormattingLocale())} />
		{:else}
			<Currency {value} {decimalScale} {isUnconverted} {isPartial} {onColoredSurface} />
		{/if}
	</div>
</div>
