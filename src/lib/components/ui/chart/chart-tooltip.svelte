<script lang="ts">
	import { getChartContext, Tooltip as TooltipPrimitive } from 'layerchart';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import Currency from '$lib/components/currency.svelte';
	import { cn, type WithElementRef } from '$lib/utils.js';

	import { getPayloadConfigFromPayload, useChart, type TooltipPayload } from './chart-utils.js';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	function defaultFormatter(value: any, _payload: TooltipPayload[]) {
		if (value instanceof Date) return value.toISOString().slice(0, 10);
		return value;
	}

	let {
		ref = $bindable(null),
		class: className,
		hideLabel = false,
		indicator = 'dot',
		hideIndicator = false,
		labelKey,
		label,
		labelFormatter = defaultFormatter,
		labelClassName,
		formatter,
		nameKey,
		color,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		hideLabel?: boolean;
		label?: string;
		indicator?: 'line' | 'dot' | 'dashed';
		nameKey?: string;
		labelKey?: string;
		hideIndicator?: boolean;
		labelClassName?: string;
		labelFormatter?: // eslint-disable-next-line @typescript-eslint/no-explicit-any
		((value: any, payload: TooltipPayload[]) => string | number | Snippet) | null;
		formatter?: Snippet<
			[
				{
					value: unknown;
					name: string;
					item: TooltipPayload;
					index: number;
					payload: TooltipPayload[];
					data: unknown;
				}
			]
		>;
	} = $props();

	const chart = useChart();
	const chartCtx = getChartContext();

	// Only series with a value for the hovered point (item-based charts like Pie/Arc
	// populate a value on the hovered series alone)
	const visibleSeries = $derived(
		chartCtx.tooltip.series.filter((s) => s.visible && s.value !== undefined)
	);

	const formattedLabel = $derived.by(() => {
		if (hideLabel || !visibleSeries.length) return null;

		const [item] = visibleSeries;
		const tooltipData = chartCtx.tooltip.data;
		// The x-axis value for the hovered point (e.g. a Date)
		const dataLabel = tooltipData != null ? chartCtx.x(tooltipData) : undefined;

		const key = labelKey ?? item.label;
		const itemConfig = getPayloadConfigFromPayload(chart.config, item, key);

		let value: unknown;
		if (!labelKey && typeof label === 'string') {
			value = chart.config[label as keyof typeof chart.config]?.label ?? label;
		} else if (labelKey) {
			value = itemConfig?.label ?? dataLabel;
		} else {
			value = dataLabel;
		}

		if (value === undefined) return null;
		if (!labelFormatter) return value;
		return labelFormatter(value, visibleSeries);
	});

	const nestLabel = $derived(visibleSeries.length === 1 && indicator !== 'dot');
</script>

{#snippet TooltipLabel()}
	{#if formattedLabel}
		<div
			class={cn('border-border -mx-2.5 border-b px-2.5 pb-1.5 text-sm font-medium', labelClassName)}
		>
			{#if typeof formattedLabel === 'function'}
				{@render formattedLabel()}
			{:else}
				{formattedLabel}
			{/if}
		</div>
	{/if}
{/snippet}

<!-- Anchor x to the highlighted point's crosshair with an offset so the tooltip sits beside
the point instead of covering it; the default `contained="container"` flips it at chart edges -->
<TooltipPrimitive.Root variant="none" x="data" xOffset={12} yOffset={12}>
	<div
		class={cn(
			'bg-background grid min-w-[9rem] items-start gap-1.5 rounded-lg px-2.5 py-1.5 shadow-xl',
			className
		)}
		{...restProps}
	>
		{#if children}
			<!-- Escape hatch: custom tooltips reuse the Root + container chrome and render their own body -->
			{@render children()}
		{:else}
			{#if !nestLabel}
				{@render TooltipLabel()}
			{/if}
			<div class="grid gap-1.5">
				{#each visibleSeries as item, i (item.key + i)}
					{@const key = nameKey || item.key}
					{@const itemConfig = getPayloadConfigFromPayload(chart.config, item, key)}
					{@const indicatorColor = color || item.color}
					<div
						class={cn(
							'[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:size-2.5',
							indicator === 'dot' && 'items-center'
						)}
					>
						{#if formatter && item.value !== undefined}
							{@render formatter({
								value: item.value,
								name: item.label,
								item,
								index: i,
								payload: visibleSeries,
								data: chartCtx.tooltip.data
							})}
						{:else}
							{#if itemConfig?.icon}
								<itemConfig.icon />
							{:else if !hideIndicator}
								<div
									style="--color-bg: {indicatorColor}; --color-border: {indicatorColor};"
									class={cn('shrink-0 rounded-lg border-(--color-border) bg-(--color-bg)', {
										'size-2.5': indicator === 'dot',
										'h-full w-1': indicator === 'line',
										'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
										'my-0.5': nestLabel && indicator === 'dashed'
									})}
								></div>
							{/if}
							<div
								class={cn(
									'flex flex-1 shrink-0 justify-between gap-4 text-base leading-none',
									nestLabel ? 'items-end' : 'items-center'
								)}
							>
								<div class="grid gap-1.5">
									{#if nestLabel}
										{@render TooltipLabel()}
									{/if}
									<span class="text-muted-foreground text-sm">
										{itemConfig?.label || item.label}
									</span>
								</div>
								{#if item.value !== undefined}
									<Currency value={item.value} />
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</TooltipPrimitive.Root>
