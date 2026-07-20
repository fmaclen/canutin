<script lang="ts" generics="T extends { date: Date }">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart, type ChartState } from 'layerchart';
	import { createAttachmentKey } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';

	import { ChartCompare, diffPercent } from '$lib/components/chart-compare.svelte.js';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import PeriodTabs, { slicePeriodRows, type PeriodKey } from '$lib/components/period-tabs.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import { m } from '$lib/paraglide/messages';

	type SeriesDef = {
		key: string;
		label: string;
		color: string;
		value: (row: T) => number;
		// Liability series compare with the raw signed diff for dollars (paying down debt
		// raises the balance toward zero, a positive, good change) but keep the performance
		// table's magnitude convention for the percent (less debt = negative %), so the two
		// deliberately carry opposite signs when green
		isLiability?: boolean;
		// When present, tooltip values render through Currency with the FX unconverted indicator
		isUnconverted?: (row: T) => boolean;
	};

	let {
		title,
		series,
		rows,
		period = $bindable(),
		// null anchors MAX at the first row; pass a date to anchor it elsewhere (e.g. the
		// earliest balance when the rows lead in with zeros)
		maxStart = null,
		isLoading,
		emptyMessage,
		formatAxisValue,
		formatTooltipValue,
		// Unset means legend only for multi-series charts; group charts opt in so a lone
		// member still gets named
		showLegend,
		...rest
	}: HTMLAttributes<HTMLDivElement> & {
		title: string;
		series: SeriesDef[];
		rows: T[];
		period: PeriodKey;
		maxStart?: Date | null;
		isLoading: boolean;
		emptyMessage: string;
		formatAxisValue: (value: number) => string;
		formatTooltipValue: (value: number) => string;
		showLegend?: boolean;
	} = $props();

	const windowedRows = $derived(slicePeriodRows(rows, period, maxStart));
	const firstRow = $derived(windowedRows[0] ?? null);
	const lastRow = $derived(windowedRows.at(-1) ?? null);
	const isMultiSeries = $derived(series.length > 1);
	const hasLegend = $derived(showLegend ?? isMultiSeries);

	// The legend overlays the plot from the top and wraps within the container width, so
	// the chart's top padding tracks its measured height to keep it clear of the marks
	let legendHeight = $state(16);
	const legendProps = {
		placement: 'top' as const,
		[createAttachmentKey()]: (node: HTMLElement) => {
			const observer = new ResizeObserver(() => (legendHeight = node.clientHeight));
			observer.observe(node);
			return () => observer.disconnect();
		}
	};
	const seriesByKey = $derived(new Map(series.map((s) => [s.key, s])));

	let chartContext = $state<ChartState<T>>();
	const hovered: T | null = $derived(chartContext?.tooltip.data ?? null);

	const chartCompare = new ChartCompare<T>();
	$effect(() => chartCompare.track(hovered));

	// Legend toggling narrows the chart's visible series; the compare tooltip and y-domain follow it
	const visibleKeys = $derived(
		new Set(chartContext?.series.visibleSeries.map((s) => s.key) ?? series.map((s) => s.key))
	);
	const comparison = $derived.by(() => {
		if (!chartCompare.range) return null;
		const [a, b] = chartCompare.range;
		return {
			a,
			b,
			rows: series
				.filter((s) => visibleKeys.has(s.key))
				.map((s) => ({
					def: s,
					...(s.isLiability
						? {
								diff: s.value(b) - s.value(a),
								percent: diffPercent(Math.abs(s.value(a)), Math.abs(s.value(b))).percent
							}
						: diffPercent(s.value(a), s.value(b))),
					isUnconverted: s.isUnconverted ? s.isUnconverted(a) || s.isUnconverted(b) : false
				}))
		};
	});

	const chartConfig = $derived(
		Object.fromEntries(
			series.map((s) => [s.key, { label: s.label, color: s.color }])
		) satisfies Chart.ChartConfig
	);

	// Identity-stable: recomputes triggered by chart-context ticks (visibleKeys is rebuilt on
	// every context change) must not hand the chart a fresh-but-equal array, or the domain prop
	// re-renders the chart, which ticks the context again in a mount-time feedback loop.
	let lastYDomain: [number, number] | null = null;
	const yDomain = $derived.by(() => {
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const row of windowedRows) {
			for (const s of series) {
				if (!visibleKeys.has(s.key)) continue;
				min = Math.min(min, s.value(row));
				max = Math.max(max, s.value(row));
			}
		}
		if (min > max) return (lastYDomain = null);
		const range = max - min;
		// NOTE: a flat series (min === max) needs a pad scaled to the value's own magnitude -
		// a fixed pad works for money (thousands) but would swamp small units like exchange rates.
		const pad = range > 0 ? range * 0.05 : Math.max(Math.abs(max) * 0.05, 0.01);
		const next: [number, number] = [min - pad, max + pad];
		if (lastYDomain && lastYDomain[0] === next[0] && lastYDomain[1] === next[1]) return lastYDomain;
		return (lastYDomain = next);
	});

	let measureCanvas: HTMLCanvasElement | null = null;
	function textWidthMono(text: string) {
		if (typeof document === 'undefined') return text.length * 8;
		if (!measureCanvas) measureCanvas = document.createElement('canvas');
		const context = measureCanvas.getContext('2d');
		if (!context) return text.length * 8;
		context.font =
			'12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
		return context.measureText(text).width;
	}

	const leftPadding = $derived.by(() => {
		if (!yDomain) return 48;
		const labels = axisTicks(yDomain[0], yDomain[1]).map((tick) => formatAxisValue(tick));
		const widest = labels.reduce((width, label) => Math.max(width, textWidthMono(label)), 0);
		return Math.max(48, Math.ceil(widest) + 16);
	});
</script>

<svelte:window onpointerup={() => chartCompare.end()} onpointercancel={() => chartCompare.end()} />

<SectionTitle {title}>
	<PeriodTabs bind:value={period} label={m.period_tabs_label({ section: title })} />
</SectionTitle>
{#if isLoading}
	<Skeleton class="h-[30vh] min-h-96" showSpinner />
{:else if rows.length < 2}
	<div class="h-[30vh] min-h-96">
		<Empty class="h-full">{emptyMessage}</Empty>
	</div>
{:else if windowedRows.length < 2}
	<div class="h-[30vh] min-h-96">
		<Empty class="h-full">{m.chart_period_empty()}</Empty>
	</div>
{:else}
	<div
		class="bg-background overflow-visible rounded-sm shadow-md"
		data-chart-period={period}
		data-chart-points={windowedRows.length}
		data-chart-start={firstRow?.date.toISOString().slice(0, 10)}
		data-chart-end={lastRow?.date.toISOString().slice(0, 10)}
		data-chart-start-value={firstRow ? series[0].value(firstRow) : undefined}
		data-chart-end-value={lastRow ? series[0].value(lastRow) : undefined}
		{...rest}
	>
		<Chart.Container
			config={chartConfig}
			class="h-[30vh] min-h-96 w-full select-none"
			role={hasLegend ? undefined : 'img'}
			aria-label={hasLegend ? undefined : series[0].label}
			onpointerdown={(event) => chartCompare.start(event, hovered)}
		>
			<LineChart
				bind:context={chartContext}
				data={windowedRows}
				x="date"
				xScale={scaleUtc()}
				yDomain={yDomain ?? undefined}
				padding={{
					top: hasLegend ? legendHeight + 16 : 16,
					right: 48,
					bottom: 24,
					left: leftPadding
				}}
				series={series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.value }))}
				legend={hasLegend ? legendProps : false}
				props={{
					// opacity 1 opts out of layerchart's series highlight, which dims the other
					// series to 0.1 while a spline or highlight point is hovered.
					// motion 'none' everywhere: layerchart's mount/update tweens re-evaluate every
					// mark's reactive props on each animation frame, which stalls the main thread
					// for seconds when several charts mount at once.
					spline: { curve: curveBumpX, opacity: 1, strokeWidth: 1.25, motion: 'none' },
					xAxis: {
						format: (v: Date) => v.toISOString().slice(0, 10),
						ticks: 6,
						motion: 'none'
					},
					yAxis: {
						motion: 'none',
						format: (v: number) => formatAxisValue(v),
						ticks: (scale) => {
							const [min, max] = scale.domain();
							return axisTicks(min, max);
						}
					},
					grid: { x: true, y: true, xTicks: 6, yTicks: [0], motion: 'none' },
					highlight: { motion: 'none', points: { r: 3, opacity: 1 } }
				}}
			>
				{#snippet aboveMarks({ context })}
					{#if comparison}
						{@const xA = context.xScale(comparison.a.date)}
						{@const xB = context.xScale(comparison.b.date)}
						<!-- With several series a gain/loss tint has no single sign to follow, so the
						band stays neutral; a lone series tints by its own change -->
						<rect
							x={Math.min(xA, xB)}
							y={0}
							width={Math.abs(xB - xA)}
							height={context.height}
							class={isMultiSeries
								? 'fill-foreground/5'
								: comparison.rows[0].diff >= 0
									? 'fill-cash/10'
									: 'fill-debt/10'}
						/>
						<line
							x1={xA}
							y1={0}
							x2={xA}
							y2={context.height}
							stroke-dasharray="2,2"
							class="stroke-foreground/30"
						/>
						{#each comparison.rows as row (row.def.key)}
							<circle
								cx={xA}
								cy={context.yScale(row.def.value(comparison.a))}
								r={3}
								fill={row.def.color}
							/>
							<circle
								cx={xB}
								cy={context.yScale(row.def.value(comparison.b))}
								r={3}
								fill={row.def.color}
							/>
						{/each}
					{/if}
				{/snippet}
				{#snippet tooltip()}
					{#if comparison}
						<Chart.Tooltip>
							<div class="border-border -mx-2.5 border-b px-2.5 pb-1.5 text-sm font-medium">
								{comparison.a.date.toISOString().slice(0, 10)} → {comparison.b.date
									.toISOString()
									.slice(0, 10)}
							</div>
							<div class="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-1.5">
								{#each comparison.rows as row (row.def.key)}
									{@const trendClass = row.diff >= 0 ? 'text-cash' : 'text-debt'}
									<div
										style="--color-bg: {row.def.color};"
										class="size-2.5 shrink-0 rounded-lg bg-(--color-bg)"
									></div>
									<span class="text-muted-foreground text-sm">{row.def.label}</span>
									<span
										class="text-right font-mono text-base leading-none tabular-nums {trendClass}"
										>{row.diff >= 0 ? '+' : ''}{#if row.def.isUnconverted}<Currency
												value={row.diff}
												isUnconverted={row.isUnconverted}
											/>{:else}{formatTooltipValue(row.diff)}{/if}</span
									>
									<span
										class="text-right font-mono text-base leading-none tabular-nums {row.percent ===
										null
											? 'text-muted-foreground'
											: trendClass}"
									>
										{#if row.percent === null}
											~
										{:else}
											{row.percent >= 0 ? '+' : ''}{row.percent.toFixed(1)}%
										{/if}
									</span>
								{/each}
							</div>
						</Chart.Tooltip>
					{:else}
						<Chart.Tooltip>
							{#snippet formatter({ value, item })}
								{@const def = seriesByKey.get(item.key)}
								{#if def}
									<div
										style="--color-bg: {def.color};"
										class="size-2.5 shrink-0 rounded-lg bg-(--color-bg)"
									></div>
									<div
										class="flex flex-1 shrink-0 items-center justify-between gap-4 text-base leading-none"
									>
										<span class="text-muted-foreground text-sm">{def.label}</span>
										{#if typeof value === 'number'}
											{#if def.isUnconverted}
												<Currency
													{value}
													isUnconverted={hovered ? def.isUnconverted(hovered) : false}
												/>
											{:else}
												<span class="font-mono tabular-nums">{formatTooltipValue(value)}</span>
											{/if}
										{/if}
									</div>
								{/if}
							{/snippet}
						</Chart.Tooltip>
					{/if}
				{/snippet}
			</LineChart>
		</Chart.Container>
	</div>
{/if}
