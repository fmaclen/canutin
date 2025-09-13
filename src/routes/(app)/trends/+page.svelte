<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveNatural } from 'd3-shape';
	import { LineChart } from 'layerchart';

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

	// Period selector
	let period: '3m' | '6m' | 'ytd' | '1y' | '5y' | 'max' = $state('1y');

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	function utcMidnight(d: Date) {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	function weeksBack(count: number): Date[] {
		const out: Date[] = [];
		const today = utcMidnight(new Date());
		for (let i = count - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setUTCDate(d.getUTCDate() - i * 7);
			out.push(d);
		}
		return out;
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

	// Raw data caches (single fetch, recompute client-side per period)
	let rawAccounts: AccountsResponse[] = $state([]);
	let rawAssets: AssetsResponse[] = $state([]);
	let rawAccountBalances: AccountBalancesResponse[] = $state([]);
	let rawAssetBalances: AssetBalancesResponse[] = $state([]);

	// Add a small headroom so lines don't appear clipped at the top
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
		// Use explicit hex to avoid any unexpected CSS overrides
		cash: { label: 'Cash', color: '#00a36f' },
		debt: { label: 'Debt', color: '#e75258' },
		investment: { label: 'Investments', color: '#b19b70' },
		other: { label: 'Other assets', color: '#5255ac' }
	} satisfies Chart.ChartConfig;

	function latestIndexBeforeOrEqual<T extends { asOf: string }>(arr: T[], t: Date, start = -1) {
		let i = start;
		while (i + 1 < arr.length && new Date(arr[i + 1].asOf) <= t) i++;
		return i;
	}

	// Quick & dirty: 2 queries with expand, then filter client-side.
	async function loadAndLogAll(): Promise<void> {
		const [accountBalancesAll, assetBalancesAll] = await Promise.all([
			pb.authedClient
				.collection('accountBalances')
				.getFullList<AccountBalancesResponse<{ account: AccountsResponse }>>({
					sort: 'asOf,created,id',
					expand: 'account'
				}),
			pb.authedClient
				.collection('assetBalances')
				.getFullList<AssetBalancesResponse<{ asset: AssetsResponse }>>({
					sort: 'asOf,created,id',
					expand: 'asset'
				})
		]);

		// Active accounts/assets: exclude flagged
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

		// Derive unique active accounts/assets from the expanded balances
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

		// Data fetched and filtered; cached below for recomputation

		// Cache raw data for recompute, then compute the current period
		rawAccounts = accounts;
		rawAssets = assets;
		rawAccountBalances = accountBalances;
		rawAssetBalances = assetBalances;

		await recomputeSeries();
	}

	if (typeof window !== 'undefined') {
		void loadAndLogAll();
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
		// max
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

		const ds: Date[] = [];
		let d = new Date(start);
		while (d <= end) {
			ds.push(new Date(d));
			// daily steps
			d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
		}
		dates = ds;

		const acctMap = new Map<string, AccountBalancesResponse[]>();
		for (const b of rawAccountBalances) {
			if (!rawAccounts.find((a) => a.id === b.account)) continue;
			const arr = acctMap.get(b.account) || [];
			arr.push(b);
			acctMap.set(b.account, arr);
		}
		const assetMap = new Map<string, AssetBalancesResponse[]>();
		for (const b of rawAssetBalances) {
			if (!rawAssets.find((a) => a.id === b.asset)) continue;
			const arr = assetMap.get(b.asset) || [];
			arr.push(b);
			assetMap.set(b.asset, arr);
		}

		const accountById = new Map(rawAccounts.map((a) => [a.id, a] as const));
		const assetById = new Map(rawAssets.map((a) => [a.id, a] as const));

		const acctPtr = new Map<string, number>();
		for (const [id, arr] of acctMap) acctPtr.set(id, latestIndexBeforeOrEqual(arr, ds[0], -1));
		const assetPtr = new Map<string, number>();
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

	$effect(() => {
		period;
		void recomputeSeries();
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
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Chart.Container config={chartConfig} class="h-[420px] w-full">
					<LineChart
						data={series}
						x="date"
						xScale={scaleUtc()}
						axis="x"
						yDomain={yDomain ?? undefined}
						padding={{ top: 16, right: 16, bottom: 24, left: 16 }}
						series={[
							{ key: 'net', label: 'Net worth', color: chartConfig.net.color },
							{ key: 'cash', label: 'Cash', color: chartConfig.cash.color },
							{ key: 'debt', label: 'Debt', color: chartConfig.debt.color },
							{ key: 'investment', label: 'Investments', color: chartConfig.investment.color },
							{ key: 'other', label: 'Other assets', color: chartConfig.other.color }
						]}
						legend={{ placement: 'top' }}
						props={{
							spline: { curve: curveNatural, motion: 'tween', strokeWidth: 1.33 },
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
