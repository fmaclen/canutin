<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { eachDayOfInterval } from 'date-fns';
	import { LineChart, type ChartState } from 'layerchart';
	import { cubicOut } from 'svelte/easing';
	import { SvelteMap } from 'svelte/reactivity';

	import {
		advanceTrendSecurityValue,
		latestIndexBeforeOrEqual,
		type TrendSecurityBalance,
		type TrendSecurityValueState
	} from '$lib/balance-series';
	import { ChartCompare, diffPercent } from '$lib/components/chart-compare.svelte.js';
	import { formatCurrency } from '$lib/components/currency';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import { axisTicks } from '$lib/components/ui/chart/chart-utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';

	import {
		computeRangeForPeriod,
		type BalanceGroup,
		type PeriodKey,
		type PreparedTrendMaps
	} from './trends';

	let {
		period = $bindable(),
		isLoading,
		prepared,
		rawAccounts,
		rawAssets,
		rawAccountBalances,
		rawSecurityBalances,
		rawAssetBalances
	}: {
		period: PeriodKey;
		isLoading: boolean;
		prepared: PreparedTrendMaps;
		rawAccounts: AccountsResponse[];
		rawAssets: AssetsResponse[];
		rawAccountBalances: AccountBalancesResponse[];
		rawSecurityBalances: TrendSecurityBalance[];
		rawAssetBalances: AssetBalancesResponse[];
	} = $props();

	type GroupKey = 'net' | 'cash' | 'debt' | 'investment' | 'other';
	// NOTE: trends hides the converted-amount indicator (page-scoped FX rule), so only the
	// unconvertible warning is tracked per group; the converted values themselves are unchanged.
	type FxFlags = { isUnconverted: boolean };
	type GroupSums = Record<Exclude<GroupKey, 'net'>, number>;
	type GroupFxFlags = Record<Exclude<GroupKey, 'net'>, FxFlags>;

	type Row = {
		date: Date;
		net: number;
		cash: number;
		debt: number;
		investment: number;
		other: number;
		fx: Record<GroupKey, FxFlags>;
	};

	const fx = getExchangeRatesContext();
	const isEmpty = $derived(!rawAccounts.length && !rawAssets.length);

	let series: Row[] = $state([]);
	const firstSeriesRow = $derived(series[0] ?? null);
	const lastSeriesRow = $derived(series.at(-1) ?? null);
	const hasUnconverted = $derived(
		series.some((row) => Object.values(row.fx).some((f) => f.isUnconverted))
	);

	let chartContext = $state<ChartState<Row>>();
	const hovered: Row | null = $derived(chartContext?.tooltip.data ?? null);

	const chartCompare = new ChartCompare<Row>();
	$effect(() => chartCompare.track(hovered));

	const groupKeys = ['net', 'cash', 'debt', 'investment', 'other'] as const;
	const comparison = $derived.by(() => {
		if (!chartCompare.range) return null;
		const [a, b] = chartCompare.range;
		// Legend toggling narrows the chart's visible series; the compare tooltip follows it
		const visibleKeys = new Set(chartContext?.series.visibleSeries.map((s) => s.key) ?? []);
		return {
			a,
			b,
			rows: groupKeys
				.filter((key) => visibleKeys.has(key))
				.map((key) => ({
					key,
					...diffPercent(a[key], b[key]),
					isUnconverted: a.fx[key].isUnconverted || b.fx[key].isUnconverted
				}))
		};
	});

	// NOTE: reference the raw tokens (--cash, not --color-cash): ChartStyle re-emits each config
	// color as --color-<key> per chart, so var(--color-cash) would be a circular reference.
	const chartConfig = {
		net: { label: m.trends_series_net_label(), color: 'var(--foreground)' },
		cash: { label: m.trends_series_cash_label(), color: 'var(--cash)' },
		debt: { label: m.trends_series_debt_label(), color: 'var(--debt)' },
		investment: { label: m.trends_series_investment_label(), color: 'var(--investment)' },
		other: { label: m.trends_series_other_label(), color: 'var(--other-assets)' }
	} satisfies Chart.ChartConfig;

	const yDomain = $derived.by(() => {
		if (!series.length) return null as [number, number] | null;
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const r of series) {
			min = Math.min(min, r.net, r.cash, r.debt, r.investment, r.other);
			max = Math.max(max, r.net, r.cash, r.debt, r.investment, r.other);
		}
		const pad = Math.max(1, (max - min) * 0.05);
		return [min - pad, max + pad] as [number, number];
	});

	function formatY(v: number) {
		return formatCurrency(v);
	}

	let _measureCanvas: HTMLCanvasElement | null = null;
	function textWidthMono(text: string) {
		if (typeof document === 'undefined') return text.length * 8;
		if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
		const ctx = _measureCanvas.getContext('2d');
		if (!ctx) return text.length * 8;
		ctx.font =
			'12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
		return ctx.measureText(text).width;
	}

	const yTickValues = $derived(yDomain ? axisTicks(yDomain[0], yDomain[1]) : ([] as number[]));

	const leftPadding = $derived.by(() => {
		const labels = yTickValues.map((v) => formatY(Math.round(v)));
		const maxW = labels.reduce((m, s) => Math.max(m, textWidthMono(s)), 0);
		return Math.max(48, Math.ceil(maxW) + 16);
	});

	function convertSnapshot<T extends { asOf: string }>(
		balances: T[],
		index: number,
		rawValue: (balance: T) => number,
		currency: string,
		terminatedAt: string | undefined,
		datePoint: Date
	) {
		if (index < 0 || (terminatedAt && datePoint >= new Date(terminatedAt))) {
			return { value: 0, isConverted: false, isUnconverted: false };
		}
		const balance = balances[index];
		return fx.convert(rawValue(balance), currency, balance.asOf);
	}

	function accumulateGroup(
		sums: GroupSums,
		flags: GroupFxFlags,
		group: BalanceGroup,
		value: number,
		conversion: FxFlags
	) {
		const key =
			group === 'CASH'
				? 'cash'
				: group === 'DEBT'
					? 'debt'
					: group === 'INVESTMENT'
						? 'investment'
						: 'other';
		if (!conversion.isUnconverted) sums[key] += value;
		flags[key] = {
			isUnconverted: flags[key].isUnconverted || conversion.isUnconverted
		};
	}

	function recomputeSeries() {
		if (!rawAccounts.length && !rawAssets.length) {
			series = [];
			return;
		}
		const { start, end } = computeRangeForPeriod(
			period,
			rawAccountBalances,
			rawSecurityBalances,
			rawAssetBalances
		);

		const datePoints = eachDayOfInterval({ start: new UTCDate(start), end: new UTCDate(end) });

		const {
			accountBalancesByAccountId,
			securityBalancesByAccountSecurity,
			assetBalancesByAssetId,
			accountById,
			assetById,
			securityCurrencyById
		} = prepared;

		const accountIndexPointer = new SvelteMap<string, number>();
		for (const [accountId, balances] of accountBalancesByAccountId)
			accountIndexPointer.set(accountId, latestIndexBeforeOrEqual(balances, datePoints[0], -1));
		const securityValueState = new SvelteMap<string, TrendSecurityValueState>();
		const assetIndexPointer = new SvelteMap<string, number>();
		for (const [assetId, balances] of assetBalancesByAssetId)
			assetIndexPointer.set(assetId, latestIndexBeforeOrEqual(balances, datePoints[0], -1));

		const rows: Row[] = [];
		for (const datePoint of datePoints) {
			const sums: GroupSums = { cash: 0, debt: 0, investment: 0, other: 0 };
			const flags: GroupFxFlags = {
				cash: { isUnconverted: false },
				debt: { isUnconverted: false },
				investment: { isUnconverted: false },
				other: { isUnconverted: false }
			};

			for (const [accountId, balances] of accountBalancesByAccountId) {
				const meta = accountById.get(accountId);
				if (!meta) continue;
				const previousIndex = accountIndexPointer.get(accountId) ?? -1;
				const index = latestIndexBeforeOrEqual(balances, datePoint, previousIndex);
				accountIndexPointer.set(accountId, index);
				const conversion = convertSnapshot(
					balances,
					index,
					(balance) => balance.value ?? 0,
					meta.currency,
					meta.closed,
					datePoint
				);
				accumulateGroup(
					sums,
					flags,
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion
				);
			}

			for (const [key, balances] of securityBalancesByAccountSecurity) {
				const accountId = balances[0]?.account;
				const meta = accountId ? accountById.get(accountId) : null;
				if (!meta) continue;
				if (meta.closed && datePoint >= new Date(meta.closed)) continue;
				const state = securityValueState.get(key) ?? {
					index: -1,
					lastKnownValue: null,
					soldOut: false
				};
				securityValueState.set(key, state);
				const rawValue = advanceTrendSecurityValue(balances, datePoint, state);
				if (rawValue === null) continue;
				// NOTE: securities load from a different context than these balances, so their currency
				// map can briefly lag; fall back to the account's currency so all-USD data stays
				// unconverted instead of flashing an FX indicator during that window.
				const conversion = fx.convert(
					rawValue,
					securityCurrencyById.get(balances[0].security) ?? meta.currency,
					balances[state.index].asOf
				);
				accumulateGroup(
					sums,
					flags,
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion
				);
			}

			for (const [assetId, balances] of assetBalancesByAssetId) {
				const meta = assetById.get(assetId);
				if (!meta) continue;
				const previousIndex = assetIndexPointer.get(assetId) ?? -1;
				const index = latestIndexBeforeOrEqual(balances, datePoint, previousIndex);
				assetIndexPointer.set(assetId, index);
				const conversion = convertSnapshot(
					balances,
					index,
					(balance) => balance.marketValue ?? 0,
					meta.currency,
					meta.sold,
					datePoint
				);
				accumulateGroup(
					sums,
					flags,
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion
				);
			}

			const net = sums.cash + sums.debt + sums.investment + sums.other;
			const netFlags: FxFlags = {
				isUnconverted:
					flags.cash.isUnconverted ||
					flags.debt.isUnconverted ||
					flags.investment.isUnconverted ||
					flags.other.isUnconverted
			};
			rows.push({
				date: datePoint,
				net,
				cash: sums.cash,
				debt: sums.debt,
				investment: sums.investment,
				other: sums.other,
				fx: { net: netFlags, ...flags }
			});
		}

		series = rows;
	}

	$effect(() => recomputeSeries());
</script>

<svelte:window onpointerup={() => chartCompare.end()} onpointercancel={() => chartCompare.end()} />

{#if isLoading}
	<Skeleton class="h-[30vh] min-h-[220px]" showSpinner />
{:else if isEmpty}
	<Empty>{m.trends_empty()}</Empty>
{:else}
	<div
		class="bg-background overflow-visible rounded-sm shadow-md"
		data-growth-period={period}
		data-growth-points={series.length}
		data-growth-start={firstSeriesRow?.date.toISOString().slice(0, 10)}
		data-growth-end={lastSeriesRow?.date.toISOString().slice(0, 10)}
		data-growth-start-net={firstSeriesRow?.net}
		data-growth-end-net={lastSeriesRow?.net}
	>
		<Chart.Container
			config={chartConfig}
			class="h-[30vh] min-h-[220px] w-full select-none"
			onpointerdown={(event) => chartCompare.start(event, hovered)}
		>
			<LineChart
				bind:context={chartContext}
				data={series}
				x="date"
				xScale={scaleUtc()}
				yDomain={yDomain ?? undefined}
				padding={{ top: 32, right: 48, bottom: 24, left: leftPadding }}
				series={[
					{ key: 'net', label: chartConfig.net.label, color: chartConfig.net.color },
					{ key: 'cash', label: chartConfig.cash.label, color: chartConfig.cash.color },
					{ key: 'debt', label: chartConfig.debt.label, color: chartConfig.debt.color },
					{
						key: 'investment',
						label: chartConfig.investment.label,
						color: chartConfig.investment.color
					},
					{ key: 'other', label: chartConfig.other.label, color: chartConfig.other.color }
				]}
				legend={{ placement: 'top' }}
				props={{
					spline: {
						curve: curveBumpX,
						motion: { type: 'tween', duration: 150, easing: cubicOut },
						strokeWidth: 1.25
					},
					xAxis: {
						format: (v: Date) => v.toISOString().slice(0, 10),
						ticks: 6
					},
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
				{#snippet aboveMarks({ context })}
					{#if comparison}
						{@const xA = context.xScale(comparison.a.date)}
						{@const xB = context.xScale(comparison.b.date)}
						<!-- Neutral band: with five series a gain/loss tint has no single sign to follow -->
						<rect
							x={Math.min(xA, xB)}
							y={0}
							width={Math.abs(xB - xA)}
							height={context.height}
							class="fill-foreground/5"
						/>
						<line
							x1={xA}
							y1={0}
							x2={xA}
							y2={context.height}
							stroke-dasharray="2,2"
							class="stroke-foreground/30"
						/>
						{#each comparison.rows as row (row.key)}
							<circle
								cx={xA}
								cy={context.yScale(comparison.a[row.key])}
								r={3}
								fill={chartConfig[row.key].color}
							/>
							<circle
								cx={xB}
								cy={context.yScale(comparison.b[row.key])}
								r={3}
								fill={chartConfig[row.key].color}
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
							<div class="grid gap-1.5">
								{#each comparison.rows as row (row.key)}
									<div class="flex w-full items-center gap-2">
										<div
											style="--color-bg: {chartConfig[row.key].color};"
											class="size-2.5 shrink-0 rounded-lg bg-(--color-bg)"
										></div>
										<div
											class="flex flex-1 shrink-0 items-center justify-between gap-4 text-base leading-none"
										>
											<span class="text-muted-foreground text-sm">{chartConfig[row.key].label}</span
											>
											<span
												class="flex items-baseline gap-2 {row.diff >= 0
													? 'text-cash'
													: 'text-debt'}"
											>
												<span class="font-mono tabular-nums"
													>{row.diff >= 0 ? '+' : ''}<Currency
														value={row.diff}
														isUnconverted={row.isUnconverted}
													/></span
												>
												{#if row.percent !== null}
													<span class="text-sm">
														{row.percent >= 0 ? '+' : ''}{row.percent.toFixed(1)}%
													</span>
												{/if}
											</span>
										</div>
									</div>
								{/each}
							</div>
						</Chart.Tooltip>
					{:else if hasUnconverted}
						<Chart.Tooltip>
							{#snippet formatter({ value, item, data })}
								{@const key = item.key as GroupKey}
								{@const seriesConfig = chartConfig[key]}
								{@const row = data as Row}
								{@const conversion = row.fx[key]}
								<div
									style="--color-bg: {seriesConfig.color}; --color-border: {seriesConfig.color};"
									class="size-2.5 shrink-0 rounded-lg border-(--color-border) bg-(--color-bg)"
								></div>
								<div
									class="flex flex-1 shrink-0 items-center justify-between gap-4 text-base leading-none"
								>
									<span class="text-muted-foreground text-sm">{seriesConfig.label}</span>
									{#if typeof value === 'number'}
										<Currency {value} isUnconverted={conversion.isUnconverted} />
									{/if}
								</div>
							{/snippet}
						</Chart.Tooltip>
					{:else}
						<Chart.Tooltip />
					{/if}
				{/snippet}
			</LineChart>
		</Chart.Container>
	</div>
{/if}
