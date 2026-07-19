<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart } from 'layerchart';

	import { formatCurrency } from '$lib/components/currency';
	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';

	import type { TrendMember, TrendMemberRow } from './trends';

	let { members, rows, color }: { members: TrendMember[]; rows: TrendMemberRow[]; color: string } =
		$props();

	// Shades of the group color, stepping toward the background so the chart reads as its group
	function memberColor(index: number) {
		return `color-mix(in oklab, ${color}, var(--background) ${Math.round((index * 60) / members.length)}%)`;
	}

	const chartConfig = $derived(
		Object.fromEntries(
			members.map((member, index) => [
				member.key,
				{ label: member.label, color: memberColor(index) }
			])
		) satisfies Chart.ChartConfig
	);

	const yDomain = $derived.by(() => {
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const row of rows) {
			for (const member of members) {
				min = Math.min(min, row.values[member.key] ?? 0);
				max = Math.max(max, row.values[member.key] ?? 0);
			}
		}
		if (min > max) return null as [number, number] | null;
		const pad = Math.max(1, (max - min) * 0.05);
		return [min - pad, max + pad] as [number, number];
	});

	const leftPadding = $derived.by(() => {
		if (!yDomain) return 48;
		const longest = axisTicks(yDomain[0], yDomain[1]).reduce(
			(width, tick) => Math.max(width, formatCurrency(Math.round(tick)).length),
			0
		);
		return Math.max(48, longest * 8 + 16);
	});
</script>

<Chart.Container config={chartConfig} class="h-[30vh] min-h-96 w-full">
	<LineChart
		data={rows}
		x="date"
		xScale={scaleUtc()}
		yDomain={yDomain ?? undefined}
		padding={{ top: 32, right: 48, bottom: 24, left: leftPadding }}
		series={members.map((member, index) => ({
			key: member.key,
			label: member.label,
			color: memberColor(index),
			value: (row: TrendMemberRow) => row.values[member.key] ?? 0
		}))}
		legend={{ placement: 'top' }}
		props={{
			// opacity 1 opts out of layerchart's series highlight, which dims the other
			// series to 0.1 while a spline or highlight point is hovered
			spline: { curve: curveBumpX, opacity: 1, strokeWidth: 1.25 },
			xAxis: {
				format: (v: Date) => v.toISOString().slice(0, 10),
				ticks: 6
			},
			yAxis: {
				format: (v: number) => formatCurrency(Math.round(v)),
				ticks: (scale) => {
					const [min, max] = scale.domain();
					return axisTicks(min, max);
				}
			},
			grid: { x: true, y: true, xTicks: 6, yTicks: [0] },
			highlight: { motion: 'none', points: { r: 3, opacity: 1 } }
		}}
	>
		{#snippet tooltip()}
			<Chart.Tooltip />
		{/snippet}
	</LineChart>
</Chart.Container>
