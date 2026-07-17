<script module lang="ts">
	import { m } from '$lib/paraglide/messages';

	import { formatNativeCurrency } from './currency';

	interface CurrencyFxLabelOptions {
		decimalScale: number;
		isUnconverted: boolean;
		missingCurrency: string | null;
		nativeCurrency?: string;
		nativeValue?: number;
	}

	export function getCurrencyFxLabel({
		decimalScale,
		isUnconverted,
		missingCurrency,
		nativeCurrency,
		nativeValue
	}: CurrencyFxLabelOptions) {
		if (isUnconverted) {
			const currency = missingCurrency ?? nativeCurrency;
			return currency ? m.fx_no_rate_available({ currency }) : m.fx_includes_unconverted();
		}
		if (nativeCurrency === undefined || nativeValue === undefined) {
			return m.fx_includes_converted();
		}

		const formattedNative = formatNativeCurrency(nativeValue, decimalScale, nativeCurrency);
		// NOTE: whether the home locale renders the ISO code (e.g. ARS as "$") depends on the
		// browser's CLDR version, so append it deterministically unless it's already there -
		// appending unconditionally would double it on newer ICU versions.
		const amount = formattedNative.includes(nativeCurrency)
			? formattedNative
			: `${formattedNative} ${nativeCurrency}`;
		return m.fx_converted_from({ amount });
	}
</script>

<script lang="ts">
	import CoinsIcon from '@lucide/svelte/icons/coins';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	import { formatCurrency } from './currency';
	import Number from './number.svelte';

	type Sentiment = 'positive' | 'negative' | 'neutral' | 'undefined';

	interface Props {
		value: number;
		decimalScale?: number;
		sentiment?: Sentiment;
		isConverted?: boolean;
		isUnconverted?: boolean;
		isPartial?: boolean;
		missingCurrency?: string | null;
		nativeCurrency?: string;
		nativeValue?: number;
		showFxTooltip?: boolean;
		onColoredSurface?: boolean;
	}

	let {
		value,
		decimalScale = 0,
		sentiment = 'undefined',
		isConverted = false,
		isUnconverted = false,
		isPartial = false,
		missingCurrency = null,
		nativeCurrency,
		nativeValue,
		showFxTooltip = true,
		onColoredSurface = false
	}: Props = $props();

	const unconvertedClasses = $derived(
		onColoredSurface ? 'text-white border-white/66' : 'text-muted-foreground border-border'
	);

	const formattedValue = $derived.by(() => {
		if (!isPartial && isUnconverted && nativeCurrency !== undefined && nativeValue !== undefined) {
			return formatNativeCurrency(nativeValue, decimalScale, nativeCurrency);
		}
		return formatCurrency(value, decimalScale);
	});

	const fxLabel = $derived(
		isPartial
			? m.fx_partial_total()
			: getCurrencyFxLabel({
					decimalScale,
					isUnconverted,
					missingCurrency,
					nativeCurrency,
					nativeValue
				})
	);
</script>

{#if isPartial || isUnconverted}
	{#if showFxTooltip}
		<Tooltip.Root>
			<Tooltip.Trigger
				aria-label={fxLabel}
				class="{unconvertedClasses} {isPartial
					? 'inline-flex items-baseline gap-1'
					: 'inline-block'} border-b border-dashed leading-none hover:border-current"
			>
				{#if isPartial}
					<span class={onColoredSurface ? 'text-white/70' : 'text-muted-foreground'}>~</span>
				{/if}
				<Number value={formattedValue} {sentiment} />
			</Tooltip.Trigger>
			<Tooltip.Content sideOffset={6}>
				<p class="text-xs leading-snug font-normal">{fxLabel}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<span
			class="{unconvertedClasses} {isPartial
				? 'inline-flex items-baseline gap-1'
				: 'inline-block'} border-b border-dashed leading-none"
		>
			{#if isPartial}
				<span class={onColoredSurface ? 'text-white/70' : 'text-muted-foreground'}>~</span>
			{/if}
			<Number value={formattedValue} {sentiment} />
		</span>
	{/if}
{:else if isConverted}
	<span class="inline-flex items-center gap-2">
		{#if showFxTooltip}
			<Tooltip.Root>
				<Tooltip.Trigger class="text-muted-foreground inline-flex shrink-0">
					<CoinsIcon class="size-3.5" aria-label={fxLabel} />
				</Tooltip.Trigger>
				<Tooltip.Content sideOffset={6}>
					<p class="text-xs leading-snug font-normal">{fxLabel}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{:else}
			<span class="text-muted-foreground inline-flex shrink-0" aria-hidden="true">
				<CoinsIcon class="size-3.5" />
			</span>
		{/if}
		<Number value={formattedValue} {sentiment} />
	</span>
{:else}
	<Number value={formattedValue} {sentiment} />
{/if}
