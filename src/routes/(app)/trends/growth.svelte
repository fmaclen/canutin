<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveBumpX } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import { SvelteMap } from 'svelte/reactivity';

	import { formatCurrency } from '$lib/components/currency';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';

	import {
		buildPreparedMaps,
		computeRangeForPeriod,
		latestIndexBeforeOrEqual,
		type BalanceGroup,
		type PeriodKey
	} from './trends';

	let {
		period = $bindable(),
		rawAccounts = $bindable(),
		rawAssets = $bindable(),
		rawAccountBalances = $bindable(),
		rawAssetBalances = $bindable()
	}: {
		period: PeriodKey;
		rawAccounts: AccountsResponse[];
		rawAssets: AssetsResponse[];
		rawAccountBalances: AccountBalancesResponse[];
		rawAssetBalances: AssetBalancesResponse[];
	} = $props();

	type Row = {
		date: Date;
		net: number;
		cash: number;
		debt: number;
		investment: number;
		other: number;
	};

	let series: Row[] = $state([]);

	const chartConfig = {
		net: { label: 'Net worth', color: '#45403C' },
		cash: { label: 'Cash', color: '#00a36f' },
		debt: { label: 'Debt', color: '#e75258' },
		investment: { label: 'Investments', color: '#b19b70' },
		other: { label: 'Other assets', color: '#5255ac' }
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

	const yTickValues = $derived.by(() => {
		if (!yDomain) return [] as number[];
		const [min, max] = yDomain;
		const ticks = [min, max];
		if (min < 0 && max > 0) ticks.splice(1, 0, 0);
		return ticks;
	});

	const leftPadding = $derived.by(() => {
		const labels = yTickValues.map((v) => formatY(Math.round(v)));
		const maxW = labels.reduce((m, s) => Math.max(m, textWidthMono(s)), 0);
		return Math.max(48, Math.ceil(maxW) + 16);
	});

	async function recomputeSeries() {
		if (!rawAccounts.length && !rawAssets.length) return;
		const { start, end } = computeRangeForPeriod(period, rawAccountBalances, rawAssetBalances);

		const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
		const endUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
		const MS_PER_DAY = 24 * 60 * 60 * 1000;
		const datePoints: Date[] = [];
		for (let utcTime = startUTC; utcTime <= endUTC; utcTime += MS_PER_DAY) {
			datePoints.push(new Date(utcTime));
		}

		const { accountBalancesByAccountId, assetBalancesByAssetId, accountById, assetById } =
			buildPreparedMaps(rawAccounts, rawAssets, rawAccountBalances, rawAssetBalances);

		const accountIndexPointer = new SvelteMap<string, number>();
		for (const [accountId, balances] of accountBalancesByAccountId)
			accountIndexPointer.set(accountId, latestIndexBeforeOrEqual(balances, datePoints[0], -1));
		const assetIndexPointer = new SvelteMap<string, number>();
		for (const [assetId, balances] of assetBalancesByAssetId)
			assetIndexPointer.set(assetId, latestIndexBeforeOrEqual(balances, datePoints[0], -1));

		const rows: Row[] = [];
		for (const datePoint of datePoints) {
			let cash = 0;
			let debt = 0;
			let investment = 0;
			let other = 0;

			for (const [accountId, balances] of accountBalancesByAccountId) {
				const meta = accountById.get(accountId);
				if (!meta) continue;
				const previousIndex = accountIndexPointer.get(accountId) ?? -1;
				const index = latestIndexBeforeOrEqual(balances, datePoint, previousIndex);
				accountIndexPointer.set(accountId, index);
				const value = index >= 0 ? (balances[index].value ?? 0) : 0;
				const group = meta.balanceGroup as BalanceGroup;
				if (group === 'CASH') cash += value;
				else if (group === 'DEBT') debt += value;
				else if (group === 'INVESTMENT') investment += value;
				else other += value;
			}

			for (const [assetId, balances] of assetBalancesByAssetId) {
				const meta = assetById.get(assetId);
				if (!meta) continue;
				const previousIndex = assetIndexPointer.get(assetId) ?? -1;
				const index = latestIndexBeforeOrEqual(balances, datePoint, previousIndex);
				assetIndexPointer.set(assetId, index);
				const value = index >= 0 ? (balances[index].value ?? 0) : 0;
				const group = meta.balanceGroup as BalanceGroup;
				if (group === 'CASH') cash += value;
				else if (group === 'DEBT') debt += value;
				else if (group === 'INVESTMENT') investment += value;
				else other += value;
			}

			const net = cash + debt + investment + other;
			rows.push({ date: datePoint, net, cash, debt, investment, other });
		}

		series = rows;
	}

	$effect(() => void recomputeSeries());
</script>

{#if series.length}
	<div class="bg-background overflow-visible rounded-sm shadow-md">
		<Chart.Container config={chartConfig} class="h-128 w-full">
			<LineChart
				data={series}
				x="date"
				xScale={scaleUtc()}
				yDomain={yDomain ?? undefined}
				padding={{ top: 32, right: 0, bottom: 24, left: leftPadding }}
				series={[
					{ key: 'net', label: 'Net worth', color: chartConfig.net.color },
					{ key: 'cash', label: 'Cash', color: chartConfig.cash.color },
					{ key: 'debt', label: 'Debt', color: chartConfig.debt.color },
					{ key: 'investment', label: 'Investments', color: chartConfig.investment.color },
					{ key: 'other', label: 'Other assets', color: chartConfig.other.color }
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
							const ticks = [min, max];
							if (min < 0 && max > 0) ticks.splice(1, 0, 0);
							return ticks;
						}
					},
					grid: { x: true, y: true, xTicks: 6, yTicks: [0] },
					highlight: { points: { r: 3 } }
				}}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</LineChart>
		</Chart.Container>
	</div>
{:else}
	<Skeleton class="h-128 w-full" />
{/if}
