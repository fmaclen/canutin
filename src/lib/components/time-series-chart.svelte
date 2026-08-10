<script lang="ts" generics="T extends { date: Date }">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart, type ChartState } from 'layerchart';
	import { createAttachmentKey } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';

	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import PeriodTabs, { slicePeriodRows, type PeriodKey } from '$lib/components/period-tabs.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
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

	// Tracks the `sm` breakpoint, below which the chart runs edge to edge (see `.full-bleed`)
	const isNarrowViewport = new IsMobile(640);

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

	// The chart lays out against a throttled container size instead of layerchart's live
	// element binding: a window drag emits dozens of resize events, and re-laying out
	// every chart on each one stalls the main thread for seconds. Between layouts the
	// last-rendered SVG is CSS-scaled to the live container size (see chartStretch), so
	// the chart stays glued to the card edge while real layouts run on the throttle.
	// The SVG renders in an absolutely-positioned wrapper so its fixed pixel size never
	// props the container open - otherwise a shrinking ancestor (sidebar expand, grid
	// breakpoint) could never get smaller and the observer would deadlock at the old size.
	const LAYOUT_THROTTLE_MS = 200;
	let liveSize = $state<{ width: number; height: number } | null>(null);
	let chartSize = $state<{ width: number; height: number } | null>(null);

	// Identity check: the throttle assigns liveSize into chartSize, so a settled chart
	// compares equal and renders untransformed
	const chartStretch = $derived.by(() => {
		if (!liveSize || !chartSize || liveSize === chartSize) return '';
		if (!chartSize.width || !chartSize.height) return '';
		const x = liveSize.width / chartSize.width;
		const y = liveSize.height / chartSize.height;
		return `transform: scale(${x}, ${y}); transform-origin: 0 0;`;
	});

	let chartContext = $state<ChartState<T>>();
	const hovered: T | null = $derived(chartContext?.tooltip.data ?? null);

	let dragging = $state.raw(false);
	let comparisonAnchor = $state.raw<T | null>(null);
	let comparisonCurrent = $state.raw<T | null>(null);
	$effect(() => {
		if (!dragging || !hovered) return;
		if (!comparisonAnchor) comparisonAnchor = hovered;
		comparisonCurrent = hovered;
	});
	function endComparison() {
		dragging = false;
		comparisonAnchor = null;
		comparisonCurrent = null;
	}

	// Touch has no hover to drive layerchart's tooltip: a finger that lands on the chart on its way
	// to scrolling the page opens one, and the pointercancel the scroll begins with leaves it
	// stranded on screen. Touch pointer events are stopped before layerchart sees them (see the plot
	// wrapper below) and the tooltip is driven from the gesture instead - a tap pins it to the tapped
	// point, a horizontal drag scrubs it along the x-axis and pins it where the finger lifts, and any
	// other touch, on this chart or elsewhere, clears it.
	const TAP_SLOP_PX = 10;
	const SCRUB_DIRECTION_PX = 8;
	let tapOrigin: { x: number; y: number } | null = null;
	let isScrubbing = false;

	// The gesture's axis is decided once, off its first few pixels of movement: mostly horizontal
	// scrubs, mostly vertical is the page scroll the plot's `touch-action: pan-y` leaves to the
	// browser (dropping the origin so the lift neither pins nor counts as a tap). Deciding once
	// means vertical wobble can't cancel a scrub halfway through.
	function trackScrub(event: PointerEvent) {
		if (!tapOrigin) return;
		if (!isScrubbing) {
			const dx = event.clientX - tapOrigin.x;
			const dy = event.clientY - tapOrigin.y;
			if (Math.hypot(dx, dy) < SCRUB_DIRECTION_PX) return;
			if (Math.abs(dy) >= Math.abs(dx)) {
				tapOrigin = null;
				return;
			}
			isScrubbing = true;
		}
		chartContext?.tooltip.show(event);
	}

	function onWindowPointerUp(event: PointerEvent) {
		endComparison();
		if (event.pointerType === 'mouse') return;
		const origin = tapOrigin;
		const wasScrubbing = isScrubbing;
		tapOrigin = null;
		isScrubbing = false;
		const isTap =
			origin !== null &&
			Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= TAP_SLOP_PX;
		if (wasScrubbing || isTap) chartContext?.tooltip.show(event);
		else chartContext?.tooltip.hide();
	}

	function onWindowPointerCancel() {
		endComparison();
		tapOrigin = null;
		isScrubbing = false;
		chartContext?.tooltip.hide();
	}

	// Legend toggling narrows the chart's visible series; the compare tooltip and y-domain follow it
	const visibleKeys = $derived(
		new Set(chartContext?.series.visibleSeries.map((s) => s.key) ?? series.map((s) => s.key))
	);
	const comparison = $derived.by(() => {
		if (!comparisonAnchor || !comparisonCurrent || comparisonAnchor === comparisonCurrent)
			return null;
		const [a, b] =
			comparisonAnchor.date <= comparisonCurrent.date
				? [comparisonAnchor, comparisonCurrent]
				: [comparisonCurrent, comparisonAnchor];
		return {
			a,
			b,
			rows: series
				.filter((s) => visibleKeys.has(s.key))
				.map((s) => {
					const earlier = s.value(a);
					const later = s.value(b);
					const diff = later - earlier;
					const percentDiff = s.isLiability ? Math.abs(later) - Math.abs(earlier) : diff;
					return {
						def: s,
						diff,
						percent: earlier === 0 ? null : (percentDiff / Math.abs(earlier)) * 100,
						isUnconverted: s.isUnconverted ? s.isUnconverted(a) || s.isUnconverted(b) : false
					};
				})
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

	// Y labels overlay the plot on phones, so they trade precision for width: $200,000 becomes
	// $200K. A unit only applies ten times above its own size, which keeps every label at two
	// significant digits ($1,860 stays spelled out instead of collapsing to $2K).
	function formatCompactAxisValue(value: number) {
		const magnitude = Math.abs(value);
		const unit =
			magnitude >= 1e10
				? { divisor: 1e9, suffix: 'B' }
				: magnitude >= 1e7
					? { divisor: 1e6, suffix: 'M' }
					: magnitude >= 1e4
						? { divisor: 1e3, suffix: 'K' }
						: null;
		if (!unit) return formatAxisValue(value);
		// The suffix goes after the last digit rather than at the end of the string, so currencies
		// formatted with a trailing code ("1,234 USDT") keep the code in place
		return formatAxisValue(value / unit.divisor).replace(/(\d)(?=\D*$)/, `$1${unit.suffix}`);
	}

	// Phones can't fit the ISO x labels, so they get the short month and apostrophe year the
	// cashflow chart uses ("Jul '26")
	const formatNarrowDate = $derived.by(() => {
		const locale = getFormattingLocale();
		const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
		const year = new Intl.DateTimeFormat(locale, { year: '2-digit', timeZone: 'UTC' });
		return (date: Date) => `${month.format(date)} '${year.format(date)}`;
	});
</script>

<svelte:window onpointerup={onWindowPointerUp} onpointercancel={onWindowPointerCancel} />

<SectionTitle {title}>
	<PeriodTabs bind:value={period} label={m.period_tabs_label({ section: title })} />
</SectionTitle>
{#if isLoading}
	<Skeleton class="full-bleed h-[30vh] min-h-96" showSpinner />
{:else if rows.length < 2}
	<div class="h-[30vh] min-h-96">
		<Empty class="full-bleed h-full">{emptyMessage}</Empty>
	</div>
{:else if windowedRows.length < 2}
	<div class="h-[30vh] min-h-96">
		<Empty class="full-bleed h-full">{m.chart_period_empty()}</Empty>
	</div>
{:else}
	<div
		class="full-bleed bg-background overflow-visible rounded-sm shadow-md"
		data-chart-period={period}
		data-chart-points={windowedRows.length}
		data-chart-start={firstRow?.date.toISOString().slice(0, 10)}
		data-chart-start-value={firstRow ? series[0].value(firstRow) : undefined}
		data-chart-end-value={lastRow ? series[0].value(lastRow) : undefined}
		{...rest}
	>
		<Chart.Container
			config={chartConfig}
			class="h-[30vh] min-h-96 w-full select-none"
			role={hasLegend ? undefined : 'img'}
			aria-label={hasLegend ? undefined : series[0].label}
			onpointerdown={(event) => {
				if (event.pointerType !== 'mouse') {
					// Comparison drag stays mouse-only - on touch that gesture is the scrub - so a touch
					// only ever records where it started. Touches landing outside the plot can't be
					// resolved to a data point, so they start neither a tap nor a scrub.
					const isInPlot =
						event.target instanceof Element && event.target.closest('.lc-root-container') !== null;
					tapOrigin = isInPlot ? { x: event.clientX, y: event.clientY } : null;
					isScrubbing = false;
					return;
				}
				if (event.button !== 0) return;
				dragging = true;
				comparisonAnchor = hovered;
				comparisonCurrent = hovered;
			}}
		>
			<div
				class="relative w-full touch-pan-y"
				{@attach (node) => {
					// layerchart opens its tooltip on pointerenter/pointermove and clears it on pointerleave,
					// none of which describe a touch gesture. Touch pointers are stopped on the way down so
					// they never reach layerchart's tooltip surface, leaving the tooltip under the explicit
					// control of the gesture handling above; mouse pointers pass through untouched.
					const stopTouchPointers = (event: Event) => {
						if (!(event instanceof PointerEvent) || event.pointerType === 'mouse') return;
						event.stopPropagation();
						if (event.type === 'pointermove') trackScrub(event);
					};
					const names = ['pointerenter', 'pointermove', 'pointerleave'];
					for (const name of names) node.addEventListener(name, stopTouchPointers, true);
					return () => {
						for (const name of names) node.removeEventListener(name, stopTouchPointers, true);
					};
				}}
				{@attach (node) => {
					let lastLayoutAt = Number.NEGATIVE_INFINITY;
					let timer = 0;
					const observer = new ResizeObserver(([entry]) => {
						liveSize = { width: entry.contentRect.width, height: entry.contentRect.height };
						const wait = lastLayoutAt + LAYOUT_THROTTLE_MS - performance.now();
						const layout = () => {
							lastLayoutAt = performance.now();
							chartSize = liveSize;
						};
						if (wait <= 0) {
							layout();
							return;
						}
						clearTimeout(timer);
						timer = window.setTimeout(layout, wait);
					});
					observer.observe(node);
					return () => {
						clearTimeout(timer);
						observer.disconnect();
					};
				}}
			>
				<div class="absolute inset-0" style={chartStretch}>
					<LineChart
						bind:context={chartContext}
						width={chartSize?.width}
						height={chartSize?.height}
						data={windowedRows}
						x="date"
						xScale={scaleUtc()}
						yDomain={yDomain ?? undefined}
						padding={{
							top: hasLegend ? legendHeight + 16 : 16,
							// Phones drop both gutters to a hairline inset: the y labels move inside the plot
							// so the marks can run the full width of the screen
							right: isNarrowViewport.current ? 12 : 48,
							bottom: 24,
							left: isNarrowViewport.current ? 12 : leftPadding
						}}
						series={series.map((s) => ({
							key: s.key,
							label: s.label,
							color: s.color,
							value: s.value
						}))}
						legend={hasLegend ? legendProps : false}
						props={{
							// opacity 1 opts out of layerchart's series highlight, which dims the other
							// series to 0.1 while a spline or highlight point is hovered.
							// motion 'none' everywhere: layerchart's mount/update tweens re-evaluate every
							// mark's reactive props on each animation frame, which stalls the main thread
							// for seconds when several charts mount at once.
							spline: { curve: curveBumpX, opacity: 1, strokeWidth: 1.25, motion: 'none' },
							xAxis: {
								format: (v: Date) =>
									isNarrowViewport.current ? formatNarrowDate(v) : v.toISOString().slice(0, 10),
								ticks: (scale) => {
									const ticks = scale.ticks?.(isNarrowViewport.current ? 4 : 6) ?? [];
									if (!isNarrowViewport.current) return ticks;
									// Labels are centered on their tick and the plot now reaches the screen edges,
									// so a tick sitting within half a label of an edge is dropped rather than clipped
									const [rangeStart, rangeEnd] = scale.range();
									return ticks.filter((tick) => {
										const x = scale(tick);
										return x - rangeStart >= 24 && rangeEnd - x >= 24;
									});
								},
								motion: 'none'
							},
							yAxis: {
								motion: 'none',
								format: (v: number) =>
									isNarrowViewport.current ? formatCompactAxisValue(v) : formatAxisValue(v),
								ticks: (scale) => {
									const [min, max] = scale.domain();
									return axisTicks(min, max);
								},
								// Without a gutter to sit in, narrow labels overlay the plot: flush with its left
								// edge, resting just above their own tick, with a background-colored halo so they
								// stay legible where a line runs underneath
								tickLabelProps: isNarrowViewport.current
									? {
											textAnchor: 'start',
											verticalAnchor: 'end',
											dx: 0,
											dy: -4,
											class: 'stroke-background! stroke-2 [paint-order:stroke]'
										}
									: undefined
							},
							grid: {
								x: true,
								y: true,
								xTicks: isNarrowViewport.current ? 4 : 6,
								yTicks: [0],
								motion: 'none'
							},
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
				</div>
			</div>
		</Chart.Container>
	</div>
{/if}
