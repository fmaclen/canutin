<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveNatural } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import { SvelteMap } from 'svelte/reactivity';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const accountsCtx = getAccountsContext();
	const assetsCtx = getAssetsContext();

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	function utcMidnight(d: Date) {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	let dates: Date[] = $state([]);

	type Row = {
		date: Date;
		net: number;
		cash: number;
		debt: number;
		investment: number;
		other: number;
	};
	let series: Row[] = $state([]);

	let period: '3m' | '6m' | 'ytd' | '1y' | '5y' | 'max' = $state('1y');
	let rawAccounts: AccountsResponse[] = $state([]);
	let rawAssets: AssetsResponse[] = $state([]);
	let rawAccountBalances: AccountBalancesResponse[] = $state([]);
	let rawAssetBalances: AssetBalancesResponse[] = $state([]);

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

	const chartConfig = {
		net: { label: 'Net worth', color: '#45403C' },
		cash: { label: 'Cash', color: '#00a36f' },
		debt: { label: 'Debt', color: '#e75258' },
		investment: { label: 'Investments', color: '#b19b70' },
		other: { label: 'Other assets', color: '#5255ac' }
	} satisfies Chart.ChartConfig;

	function formatY(v: number) {
		return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
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
		let i = start;
		while (i + 1 < arr.length && new Date(arr[i + 1].asOf) <= t) i++;
		return i;
	}

    async function loadAndLogAll() {
		const [accountBalancesAll, assetBalancesAll] = await Promise.all([
			pb.authedClient
				.collection('accountBalances')
				.getFullList<AccountBalancesResponse<{ account: AccountsResponse }>>({
					sort: 'asOf,created,id',
					fields: 'id,account,value,asOf,expand',
					expand: 'account',
					requestKey: 'trends:accountBalances'
				}),
			pb.authedClient
				.collection('assetBalances')
				.getFullList<AssetBalancesResponse<{ asset: AssetsResponse }>>({
					sort: 'asOf,created,id',
					fields: 'id,asset,value,asOf,expand',
					expand: 'asset',
					requestKey: 'trends:assetBalances'
				})
		]);

		const accountBalances = accountBalancesAll.filter((b) => {
			const acc = (b.expand?.account ?? null) as AccountsResponse | null;
			if (!acc) return false;
			return !acc.excluded && !acc.closed;
		});
		const assetBalances = assetBalancesAll.filter((b) => {
			const as = (b.expand?.asset ?? null) as AssetsResponse | null;
			if (!as) return false;
			return !as.excluded && !as.sold;
		});

		const accountsMap = new Map<string, AccountsResponse>();
		for (const b of accountBalances) {
			const acc = b.expand?.account as AccountsResponse | undefined;
			if (acc) accountsMap.set(acc.id, acc);
		}
		const assetsMap = new Map<string, AssetsResponse>();
		for (const b of assetBalances) {
			const as = b.expand?.asset as AssetsResponse | undefined;
			if (as) assetsMap.set(as.id, as);
		}

		const accounts = Array.from(accountsMap.values());
		const assets = Array.from(assetsMap.values());

		rawAccounts = accounts;
		rawAssets = assets;
		rawAccountBalances = accountBalances;
		rawAssetBalances = assetBalances;

		await recomputeSeries();
		bootstrapped = true;
	}

	function computeRangeForPeriod(p: typeof period) {
		const now = utcMidnight(new Date());
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
			? utcMidnight(earliest)
			: new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
		return { start, end: now };
	}

	async function recomputeSeries() {
		if (!rawAccounts.length && !rawAssets.length) return;
		const { start, end } = computeRangeForPeriod(period);

		const dateSet = new Set<number>();
		const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
		const endUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

		for (const b of rawAccountBalances) {
			if (!rawAccounts.find((a) => a.id === b.account)) continue;
			const t = new Date(b.asOf);
			const u = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
			if (u >= startUTC && u <= endUTC) dateSet.add(u);
		}
		for (const b of rawAssetBalances) {
			if (!rawAssets.find((a) => a.id === b.asset)) continue;
			const t = new Date(b.asOf);
			const u = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
			if (u >= startUTC && u <= endUTC) dateSet.add(u);
		}

		dateSet.add(startUTC);
		dateSet.add(endUTC);

		const ds = Array.from(dateSet)
			.sort((a, b) => a - b)
			.map((u) => new Date(u));
		dates = ds;

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
		for (const [id, arr] of acctMap) acctPtr.set(id, latestIndexBeforeOrEqual(arr, ds[0], -1));
		const assetPtr = new SvelteMap<string, number>();
		for (const [id, arr] of assetMap) assetPtr.set(id, latestIndexBeforeOrEqual(arr, ds[0], -1));

		const rows: Row[] = [];
		for (const t of ds) {
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

	async function refreshBalances() {
		const [accountBalancesAll, assetBalancesAll] = await Promise.all([
			pb.authedClient
				.collection('accountBalances')
				.getFullList<AccountBalancesResponse<{ account: AccountsResponse }>>({
					sort: 'asOf,created,id',
					fields: 'id,account,value,asOf,expand',
					expand: 'account',
					requestKey: 'trends:accountBalances'
				}),
			pb.authedClient
				.collection('assetBalances')
				.getFullList<AssetBalancesResponse<{ asset: AssetsResponse }>>({
					sort: 'asOf,created,id',
					fields: 'id,asset,value,asOf,expand',
					expand: 'asset',
					requestKey: 'trends:assetBalances'
				})
		]);

		const accountBalances = accountBalancesAll.filter((b) => {
			const acc = (b.expand?.account ?? null) as AccountsResponse | null;
			if (!acc) return false;
			return !acc.excluded && !acc.closed;
		});
		const assetBalances = assetBalancesAll.filter((b) => {
			const as = (b.expand?.asset ?? null) as AssetsResponse | null;
			if (!as) return false;
			return !as.excluded && !as.sold;
		});

		const accountsMap = new Map<string, AccountsResponse>();
		for (const b of accountBalances) {
			const acc = b.expand?.account as AccountsResponse | undefined;
			if (acc) accountsMap.set(acc.id, acc);
		}
		const assetsMap = new Map<string, AssetsResponse>();
		for (const b of assetBalances) {
			const as = b.expand?.asset as AssetsResponse | undefined;
			if (as) assetsMap.set(as.id, as);
		}

		rawAccounts = Array.from(accountsMap.values());
		rawAssets = Array.from(assetsMap.values());
		rawAccountBalances = accountBalances;
		rawAssetBalances = assetBalances;

		await recomputeSeries();
	}

	let refreshTimer: number | null = null;
	let refreshInFlight = false;
	let pendingRefresh = false;
	let bootstrapped = false;

	async function doRefresh() {
		refreshInFlight = true;
		await refreshBalances();
		refreshInFlight = false;
		if (pendingRefresh) {
			pendingRefresh = false;
			void doRefresh();
		}
	}

	function scheduleRefresh() {
		if (!bootstrapped) return;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			if (refreshInFlight) {
				pendingRefresh = true;
				return;
			}
			void doRefresh();
		}, 180);
	}

	$effect(() => void loadAndLogAll());

	$effect(() => {
		if (period) void recomputeSeries();
	});

	$effect(() => {
		if (accountsCtx?.lastBalanceEvent) scheduleRefresh();
	});

	$effect(() => {
		if (assetsCtx?.lastBalanceEvent) scheduleRefresh();
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_trends()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<div class="flex flex-col space-y-4 p-8">
	<Tabs.Root bind:value={period}>
		<nav class="flex items-center justify-between space-x-2">
			<SectionTitle title="Net worth" />
			<Tabs.List>
				<Tabs.Trigger value="3m">3M</Tabs.Trigger>
				<Tabs.Trigger value="6m">6M</Tabs.Trigger>
				<Tabs.Trigger value="ytd">YTD</Tabs.Trigger>
				<Tabs.Trigger value="1y">1Y</Tabs.Trigger>
				<Tabs.Trigger value="5y">5Y</Tabs.Trigger>
				<Tabs.Trigger value="max">MAX</Tabs.Trigger>
			</Tabs.List>
		</nav>
		{#if series.length}
			<div class="bg-background overflow-visible rounded-sm shadow-md">
				<Chart.Container
					config={chartConfig}
					class="h-128 w-full [&_.lc-axis-x_.lc-axis-tick-label]:font-mono [&_.lc-axis-x_.lc-axis-tick:first-child_.lc-axis-tick-label]:hidden [&_.lc-axis-y_.lc-axis-tick-label]:font-mono"
				>
					<LineChart
						data={series}
						x="date"
						xScale={scaleUtc()}
						yDomain={yDomain ?? undefined}
						padding={{ top: 16, right: 16, bottom: 24, left: leftPadding }}
						series={[
							{ key: 'net', label: 'Net worth', color: chartConfig.net.color },
							{ key: 'cash', label: 'Cash', color: chartConfig.cash.color },
							{ key: 'debt', label: 'Debt', color: chartConfig.debt.color },
							{ key: 'investment', label: 'Investments', color: chartConfig.investment.color },
							{ key: 'other', label: 'Other assets', color: chartConfig.other.color }
						]}
						legend={{ placement: 'top' }}
						props={{
							spline: { curve: curveNatural, motion: 'none', strokeWidth: 1.33 },
							xAxis: {
								format: (v: Date) => v.toISOString().slice(0, 10)
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
							highlight: { points: { r: 3 } }
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip hideLabel />
						{/snippet}
					</LineChart>
				</Chart.Container>
			</div>
		{:else}
			<div class="text-muted-foreground text-sm">Loading…</div>
		{/if}
	</Tabs.Root>
</div>
