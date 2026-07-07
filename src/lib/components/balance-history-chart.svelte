<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart } from 'layerchart';

	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';

	let {
		points,
		seriesLabel,
		formatAxisValue,
		formatTooltipValue
	}: {
		points: { date: Date; value: number }[];
		seriesLabel: string;
		formatAxisValue: (value: number) => string;
		formatTooltipValue: (value: number) => string;
	} = $props();

	const chartConfig = {
		series: { label: seriesLabel, color: '#45403C' }
	} satisfies Chart.ChartConfig;

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

<Chart.Container config={chartConfig} class="h-[30vh] min-h-[220px] w-full">
	<LineChart
		data={points}
		x="date"
		xScale={scaleUtc()}
		{yDomain}
		padding={{ top: 16, right: 48, bottom: 24, left: leftPadding }}
		series={[{ key: 'value', label: chartConfig.series.label, color: chartConfig.series.color }]}
		props={{
			spline: { curve: curveBumpX, motion: 'tween', strokeWidth: 1.25 },
			xAxis: { format: (v: Date) => v.toISOString().slice(0, 10), ticks: 6 },
			yAxis: {
				format: (v: number) => formatAxisValue(v),
				ticks: (scale) => {
					const [min, max] = scale.domain();
					return axisTicks(min, max);
				}
			},
			grid: { x: true, y: true, xTicks: 6, yTicks: [0] },
			highlight: { points: { r: 3 } }
		}}
	>
		{#snippet tooltip()}
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
		{/snippet}
	</LineChart>
</Chart.Container>
