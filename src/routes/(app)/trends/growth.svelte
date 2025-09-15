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

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	let {
		period = $bindable<'3m' | '6m' | 'ytd' | '1y' | '5y' | 'max'>('1y'),
		rawAccounts = $bindable<AccountsResponse[]>([]),
		rawAssets = $bindable<AssetsResponse[]>([]),
		rawAccountBalances = $bindable<AccountBalancesResponse[]>([]),
		rawAssetBalances = $bindable<AssetBalancesResponse[]>([])
	} = $props();

	function startOfDayUTC(d: Date) {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	function endOfDayUTC(d: Date) {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
	}

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

	function latestIndexBeforeOrEqual<T extends { asOf: string }>(arr: T[], t: Date, start = -1) {
		const cutoff = endOfDayUTC(t);
		let i = start;
		while (i + 1 < arr.length && new Date(arr[i + 1].asOf) <= cutoff) i++;
		return i;
	}

	function computeRangeForPeriod(p: typeof period) {
		const now = startOfDayUTC(new Date());
		if (p === '3m')
			return {
				start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate())),
				end: now
			};
		if (p === '6m')
			return {
				start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate())),
				end: now
			};
		if (p === 'ytd') return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: now };
		if (p === '1y')
			return {
				start: new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())),
				end: now
			};
		if (p === '5y')
			return {
				start: new Date(Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate())),
				end: now
			};
		let earliest: Date | null = null;
		for (const b of rawAccountBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}
		for (const b of rawAssetBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}
		const start = earliest
			? startOfDayUTC(earliest)
			: new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
		return { start, end: now };
	}

	async function recomputeSeries() {
		if (!rawAccounts.length && !rawAssets.length) return;
		const { start, end } = computeRangeForPeriod(period);

		const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
		const endUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
		const DAY = 24 * 60 * 60 * 1000;
		const datePoints: Date[] = [];
		for (let u = startUTC; u <= endUTC; u += DAY) {
			datePoints.push(new Date(u));
		}

		const acctMap = new SvelteMap<string, AccountBalancesResponse[]>();
		for (const b of rawAccountBalances) {
			if (!rawAccounts.find((a) => a.id === b.account)) continue;
			const arr = acctMap.get(b.account) || [];
			arr.push(b);
			acctMap.set(b.account, arr);
		}
		const assetMap = new SvelteMap<string, AssetBalancesResponse[]>();
		for (const b of rawAssetBalances) {
			if (!rawAssets.find((a) => a.id === b.asset)) continue;
			const arr = assetMap.get(b.asset) || [];
			arr.push(b);
			assetMap.set(b.asset, arr);
		}

		const accountById = new Map(rawAccounts.map((a) => [a.id, a] as const));
		const assetById = new Map(rawAssets.map((a) => [a.id, a] as const));

		const acctPtr = new SvelteMap<string, number>();
		for (const [id, arr] of acctMap)
			acctPtr.set(id, latestIndexBeforeOrEqual(arr, datePoints[0], -1));
		const assetPtr = new SvelteMap<string, number>();
		for (const [id, arr] of assetMap)
			assetPtr.set(id, latestIndexBeforeOrEqual(arr, datePoints[0], -1));

		const rows: Row[] = [];
		for (const t of datePoints) {
			let cash = 0;
			let debt = 0;
			let investment = 0;
			let other = 0;

			for (const [id, arr] of acctMap) {
				const meta = accountById.get(id);
				if (!meta) continue;
				const prev = acctPtr.get(id) ?? -1;
				const idx = latestIndexBeforeOrEqual(arr, t, prev);
				acctPtr.set(id, idx);
				const val = idx >= 0 ? (arr[idx].value ?? 0) : 0;
				const g = meta.balanceGroup as BalanceGroup;
				if (g === 'CASH') cash += val;
				else if (g === 'DEBT') debt += val;
				else if (g === 'INVESTMENT') investment += val;
				else other += val;
			}

			for (const [id, arr] of assetMap) {
				const meta = assetById.get(id);
				if (!meta) continue;
				const prev = assetPtr.get(id) ?? -1;
				const idx = latestIndexBeforeOrEqual(arr, t, prev);
				assetPtr.set(id, idx);
				const val = idx >= 0 ? (arr[idx].value ?? 0) : 0;
				const g = meta.balanceGroup as BalanceGroup;
				if (g === 'CASH') cash += val;
				else if (g === 'DEBT') debt += val;
				else if (g === 'INVESTMENT') investment += val;
				else other += val;
			}

			const net = cash + debt + investment + other;
			rows.push({ date: t, net, cash, debt, investment, other });
		}

		series = rows;
	}

	$effect(() => void recomputeSeries());
</script>

{#if series.length}
	<div class="bg-background overflow-visible rounded-sm shadow-md">
		<Chart.Container
			config={{
				net: { label: 'Net worth', color: '#45403C' },
				cash: { label: 'Cash', color: '#00a36f' },
				debt: { label: 'Debt', color: '#e75258' },
				investment: { label: 'Investments', color: '#b19b70' },
				other: { label: 'Other assets', color: '#5255ac' }
			}}
			class="h-128 w-full"
		>
			<LineChart
				data={series}
				x="date"
				xScale={scaleUtc()}
				yDomain={yDomain ?? undefined}
				padding={{ top: 16, right: 0, bottom: 24, left: leftPadding }}
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
