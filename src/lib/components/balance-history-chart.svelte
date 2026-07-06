<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart } from 'layerchart';

	import { formatNativeCurrency } from '$lib/components/currency';
	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { m } from '$lib/paraglide/messages';

	let { points, currency }: { points: { date: Date; value: number }[]; currency: string } =
		$props();

	const chartConfig = {
		balance: { label: m.balance_history_series_label(), color: '#45403C' }
	} satisfies Chart.ChartConfig;

	function formatY(value: number) {
		return formatNativeCurrency(value, 0, currency);
	}

	const yDomain = $derived.by(() => {
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const point of points) {
			min = Math.min(min, point.value);
			max = Math.max(max, point.value);
		}
		const pad = Math.max(1, (max - min) * 0.05);
		return [min - pad, max + pad] as [number, number];
	});

	const leftPadding = $derived.by(() => {
		const longest = axisTicks(yDomain[0], yDomain[1]).reduce(
			(width, tick) => Math.max(width, formatY(Math.round(tick)).length),
			0
		);
		return Math.max(48, longest * 8 + 16);
	});
</script>

<Chart.Container config={chartConfig} class="h-64 w-full">
	<LineChart
		data={points}
		x="date"
		xScale={scaleUtc()}
		{yDomain}
		padding={{ top: 16, right: 48, bottom: 24, left: leftPadding }}
		series={[{ key: 'value', label: chartConfig.balance.label, color: chartConfig.balance.color }]}
		props={{
			spline: { curve: curveBumpX, motion: 'tween', strokeWidth: 1.25 },
			xAxis: { format: (v: Date) => v.toISOString().slice(0, 10), ticks: 6 },
			yAxis: {
				format: (v: number) => formatY(Math.round(v)),
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
						style="--color-bg: {chartConfig.balance.color};"
						class="size-2.5 shrink-0 rounded-lg bg-(--color-bg)"
					></div>
					<div
						class="flex flex-1 shrink-0 items-center justify-between gap-4 text-base leading-none"
					>
						<span class="text-muted-foreground text-sm">{chartConfig.balance.label}</span>
						{#if typeof value === 'number'}
							<span class="font-mono tabular-nums">{formatNativeCurrency(value, 2, currency)}</span>
						{/if}
					</div>
				{/snippet}
			</Chart.Tooltip>
		{/snippet}
	</LineChart>
</Chart.Container>
