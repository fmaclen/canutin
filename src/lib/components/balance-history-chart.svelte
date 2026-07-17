<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart, type ChartState } from 'layerchart';

	import { ChartCompare, diffPercent } from '$lib/components/chart-compare.svelte.js';
	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';

	type Point = { date: Date; value: number };

	let {
		points,
		seriesLabel,
		formatAxisValue,
		formatTooltipValue
	}: {
		points: Point[];
		seriesLabel: string;
		formatAxisValue: (value: number) => string;
		formatTooltipValue: (value: number) => string;
	} = $props();

	let chartContext = $state<ChartState<Point>>();
	const hovered: Point | null = $derived(chartContext?.tooltip.data ?? null);

	const chartCompare = new ChartCompare<Point>();
	$effect(() => chartCompare.track(hovered));

	const compare = $derived.by(() => {
		if (!chartCompare.range) return null;
		const [a, b] = chartCompare.range;
		return { a, b, ...diffPercent(a.value, b.value) };
	});

	const chartConfig = $derived({
		series: { label: seriesLabel, color: 'var(--brand)' }
	} satisfies Chart.ChartConfig);

	const yDomain = $derived.by(() => {
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const point of points) {
			min = Math.min(min, point.value);
			max = Math.max(max, point.value);
		}
		const range = max - min;
		// NOTE: a flat series (min === max) needs a pad scaled to the value's own magnitude -
		// a fixed pad works for money (thousands) but would swamp small units like exchange rates.
		const pad = range > 0 ? range * 0.05 : Math.max(Math.abs(max) * 0.05, 0.01);
		return [min - pad, max + pad] as [number, number];
	});

	const leftPadding = $derived.by(() => {
		const longest = axisTicks(yDomain[0], yDomain[1]).reduce(
			(width, tick) => Math.max(width, formatAxisValue(tick).length),
			0
		);
		return Math.max(48, longest * 8 + 16);
	});
</script>

<svelte:window onpointerup={() => chartCompare.end()} onpointercancel={() => chartCompare.end()} />

<Chart.Container
	config={chartConfig}
	class="h-[30vh] min-h-[220px] w-full select-none"
	role="img"
	aria-label={seriesLabel}
	onpointerdown={(event) => chartCompare.start(event, hovered)}
>
	<LineChart
		bind:context={chartContext}
		data={points}
		x="date"
		xScale={scaleUtc()}
		{yDomain}
		padding={{ top: 16, right: 48, bottom: 24, left: leftPadding }}
		series={[{ key: 'value', label: chartConfig.series.label, color: chartConfig.series.color }]}
		props={{
			spline: { curve: curveBumpX, strokeWidth: 1.25 },
			xAxis: { format: (v: Date) => v.toISOString().slice(0, 10), ticks: 6 },
			yAxis: {
				format: (v: number) => formatAxisValue(v),
				ticks: (scale) => {
					const [min, max] = scale.domain();
					return axisTicks(min, max);
				}
			},
			grid: { x: true, y: true, xTicks: 6, yTicks: [0] },
			highlight: { motion: 'none', points: { r: 3 } }
		}}
	>
		{#snippet aboveMarks({ context })}
			{#if compare}
				{@const xA = context.xScale(compare.a.date)}
				{@const xB = context.xScale(compare.b.date)}
				<rect
					x={Math.min(xA, xB)}
					y={0}
					width={Math.abs(xB - xA)}
					height={context.height}
					class={compare.diff >= 0 ? 'fill-cash/10' : 'fill-debt/10'}
				/>
				<line
					x1={xA}
					y1={0}
					x2={xA}
					y2={context.height}
					stroke-dasharray="2,2"
					class="stroke-foreground/30"
				/>
				<circle
					cx={xA}
					cy={context.yScale(compare.a.value)}
					r={3}
					fill={chartConfig.series.color}
				/>
				<circle
					cx={xB}
					cy={context.yScale(compare.b.value)}
					r={3}
					fill={chartConfig.series.color}
				/>
			{/if}
		{/snippet}
		{#snippet tooltip()}
			{#if compare}
				<Chart.Tooltip>
					<div class="border-border -mx-2.5 border-b px-2.5 pb-1.5 text-sm font-medium">
						{compare.a.date.toISOString().slice(0, 10)} → {compare.b.date
							.toISOString()
							.slice(0, 10)}
					</div>
					<div
						class="flex items-center justify-between gap-4 font-mono text-base leading-none tabular-nums {compare.diff >=
						0
							? 'text-cash'
							: 'text-debt'}"
					>
						<span>{compare.diff >= 0 ? '+' : ''}{formatTooltipValue(compare.diff)}</span>
						{#if compare.percent !== null}
							<span class="text-sm">
								{compare.percent >= 0 ? '+' : ''}{compare.percent.toFixed(1)}%
							</span>
						{/if}
					</div>
				</Chart.Tooltip>
			{:else}
				<Chart.Tooltip>
					{#snippet formatter({ value })}
						<div
							style="--color-bg: {chartConfig.series.color};"
							class="size-2.5 shrink-0 rounded-lg bg-(--color-bg)"
						></div>
						<div
							class="flex flex-1 shrink-0 items-center justify-between gap-4 text-base leading-none"
						>
							<span class="text-muted-foreground text-sm">{chartConfig.series.label}</span>
							{#if typeof value === 'number'}
								<span class="font-mono tabular-nums">{formatTooltipValue(value)}</span>
							{/if}
						</div>
					{/snippet}
				</Chart.Tooltip>
			{/if}
		{/snippet}
	</LineChart>
</Chart.Container>
