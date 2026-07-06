<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import { SvelteMap } from 'svelte/reactivity';

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
		advanceTrendSecurityValue,
		computeRangeForPeriod,
		latestIndexBeforeOrEqual,
		type BalanceGroup,
		type PeriodKey,
		type PreparedTrendMaps,
		type TrendSecurityBalance,
		type TrendSecurityValueState
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

	const chartConfig = {
		net: { label: m.trends_series_net_label(), color: '#45403C' },
		cash: { label: m.trends_series_cash_label(), color: '#00a36f' },
		debt: { label: m.trends_series_debt_label(), color: '#e75258' },
		investment: { label: m.trends_series_investment_label(), color: '#b19b70' },
		other: { label: m.trends_series_other_label(), color: '#5255ac' }
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

		const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
		const endUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
		const MS_PER_DAY = 24 * 60 * 60 * 1000;
		const datePoints: Date[] = [];
		for (let utcTime = startUTC; utcTime <= endUTC; utcTime += MS_PER_DAY) {
			datePoints.push(new Date(utcTime));
		}

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

{#if isLoading}
	<Skeleton class="h-96" showSpinner />
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
		<Chart.Container config={chartConfig} class="h-96 w-full">
			<LineChart
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
					spline: { curve: curveBumpX, motion: 'tween', strokeWidth: 1.25 },
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
				{#snippet tooltip()}
					{#if hasUnconverted}
						<Chart.Tooltip>
							{#snippet formatter({ value, item })}
								{@const key = item.key as GroupKey}
								{@const seriesConfig = chartConfig[key]}
								{@const row = item.payload as Row}
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
