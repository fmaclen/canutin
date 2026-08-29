<script lang="ts">
	import { getChartContext, Tooltip as TooltipPrimitive, type Tooltip } from 'layerchart';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		formatter,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		formatter?: Snippet<
			[
				{
					value: unknown;
					item: Tooltip.TooltipSeries;
				}
			]
		>;
	} = $props();

	const chart = getChartContext<unknown>();

	// Only series with a value for the hovered point (item-based charts like Pie/Arc
	// populate a value on the hovered series alone)
	const visibleSeries = $derived(
		chart.tooltip.series.filter((series) => series.visible && series.value !== undefined)
	);

	const label = $derived.by(() => {
		if (chart.tooltip.data == null) return null;
		const value = chart.x(chart.tooltip.data);
		return value instanceof Date ? value.toISOString().slice(0, 10) : value;
	});
</script>

<!-- Pinned to the top of the plot area (fixed y, below any top legend) with snap positioning
(motion "none") so the tooltip never chases or eases after the cursor; x still anchors to the
highlighted point's crosshair and the default `contained="container"` flips it at chart edges -->
<TooltipPrimitive.Root variant="none" motion="none" x="data" xOffset={12} y={chart.padding.top}>
	<div
		class={cn(
			'bg-tooltip grid min-w-[9rem] items-start gap-1.5 rounded-lg px-2.5 py-1.5 shadow-xl',
			className
		)}
		{...restProps}
	>
		{#if children}
			{@render children()}
		{:else if formatter}
			{#if label}
				<div class="border-border -mx-2.5 border-b px-2.5 pb-1.5 text-sm font-medium">
					{label}
				</div>
			{/if}
			<div class="grid gap-1.5">
				{#each visibleSeries as item, index (item.key + index)}
					<div class="flex w-full flex-wrap items-center gap-2">
						{@render formatter({ value: item.value, item })}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</TooltipPrimitive.Root>
