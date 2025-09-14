<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	let {
		rawAccounts = $bindable<AccountsResponse[]>([]),
		rawAssets = $bindable<AssetsResponse[]>([]),
		rawAccountBalances = $bindable<AccountBalancesResponse[]>([]),
		rawAssetBalances = $bindable<AssetBalancesResponse[]>([])
	} = $props();

	type PeriodOffset = {
		days?: number;
		months?: number;
		years?: number;
		ytd?: boolean;
		max?: boolean;
	};
	type PeriodDef = { key: string; label: string; offset: PeriodOffset };
	const periods: PeriodDef[] = [
		{ key: '1w', label: '1W', offset: { days: 7 } },
		{ key: '1m', label: '1M', offset: { months: 1 } },
		{ key: '6m', label: '6M', offset: { months: 6 } },
		{ key: 'ytd', label: 'YTD', offset: { ytd: true } },
		{ key: '1y', label: '1Y', offset: { years: 1 } },
		{ key: '5y', label: '5Y', offset: { years: 5 } },
		{ key: 'max', label: 'MAX', offset: { max: true } }
	];

	function utcMidnight(d: Date) {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	function subDate(now: Date, o: { days?: number; months?: number; years?: number }) {
		return new Date(
			Date.UTC(
				now.getUTCFullYear() - (o.years ?? 0),
				now.getUTCMonth() - (o.months ?? 0),
				now.getUTCDate() - (o.days ?? 0)
			)
		);
	}

	function latestIndexBeforeOrEqual<T extends { asOf: string }>(arr: T[], t: Date, start = -1) {
		let i = start;
		while (i + 1 < arr.length && new Date(arr[i + 1].asOf) <= t) i++;
		return i;
	}

	function buildMaps() {
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
		return { acctMap, assetMap };
	}

	function snapshotTotals(at: Date) {
		const { acctMap, assetMap } = buildMaps();
		const accountById = new Map(rawAccounts.map((a) => [a.id, a] as const));
		const assetById = new Map(rawAssets.map((a) => [a.id, a] as const));

		let cash = 0;
		let debt = 0;
		let investment = 0;
		let other = 0;

		for (const [id, arr] of acctMap) {
			const meta = accountById.get(id);
			if (!meta) continue;
			const idx = latestIndexBeforeOrEqual(arr, at, -1);
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
			const idx = latestIndexBeforeOrEqual(arr, at, -1);
			const val = idx >= 0 ? (arr[idx].value ?? 0) : 0;
			const g = meta.balanceGroup as BalanceGroup;
			if (g === 'CASH') cash += val;
			else if (g === 'DEBT') debt += val;
			else if (g === 'INVESTMENT') investment += val;
			else other += val;
		}

		const net = cash + debt + investment + other;
		return { net, cash, debt, investment, other } as const;
	}

	const table = $derived.by(() => {
		if (!rawAccounts.length && !rawAssets.length) return null;
		const now = utcMidnight(new Date());

		let earliest: Date | null = null;
		for (const b of rawAccountBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}
		for (const b of rawAssetBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}

		const current = snapshotTotals(now);
		const cols = periods.map((p) => {
			let at: Date;
			if (p.offset.max) at = earliest ? utcMidnight(earliest) : now;
			else if (p.offset.ytd) at = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
			else at = subDate(now, p.offset);
			const past = snapshotTotals(at);

			function pctDiff(cur: number, prev: number) {
				if (!prev || prev === 0) return null as number | null;
				return (cur - prev) / Math.abs(prev);
			}

			return {
				key: p.key,
				label: p.label,
				at,
				values: {
					net: pctDiff(current.net, past.net),
					cash: pctDiff(current.cash, past.cash),
					debt: pctDiff(current.debt, past.debt),
					investment: pctDiff(current.investment, past.investment),
					other: pctDiff(current.other, past.other)
				}
			};
		});

		const allocation = {
			net: 1,
			cash: current.net !== 0 ? current.cash / current.net : 0,
			debt: current.net !== 0 ? current.debt / current.net : 0,
			investment: current.net !== 0 ? current.investment / current.net : 0,
			other: current.net !== 0 ? current.other / current.net : 0
		};

		return { cols, current, allocation };
	});

	function fmtPct(v: number | null) {
		if (v === null) return '—';
		return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(v);
	}
</script>

{#if table}
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr>
					<th class="text-left">Group</th>
					{#each table.cols as c (c.key)}
						<th class="text-right whitespace-nowrap">{c.label}</th>
					{/each}
					<th class="text-right whitespace-nowrap">Allocation</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>Net worth</td>
					{#each table.cols as c (c.key)}
						<td class="text-right">{fmtPct(c.values.net)}</td>
					{/each}
					<td class="text-right">{fmtPct(table.allocation.net)}</td>
				</tr>
				<tr>
					<td>Cash</td>
					{#each table.cols as c (c.key)}
						<td class="text-right">{fmtPct(c.values.cash)}</td>
					{/each}
					<td class="text-right">{fmtPct(table.allocation.cash)}</td>
				</tr>
				<tr>
					<td>Debt</td>
					{#each table.cols as c (c.key)}
						<td class="text-right">{fmtPct(c.values.debt)}</td>
					{/each}
					<td class="text-right">{fmtPct(table.allocation.debt)}</td>
				</tr>
				<tr>
					<td>Investments</td>
					{#each table.cols as c (c.key)}
						<td class="text-right">{fmtPct(c.values.investment)}</td>
					{/each}
					<td class="text-right">{fmtPct(table.allocation.investment)}</td>
				</tr>
				<tr>
					<td>Other assets</td>
					{#each table.cols as c (c.key)}
						<td class="text-right">{fmtPct(c.values.other)}</td>
					{/each}
					<td class="text-right">{fmtPct(table.allocation.other)}</td>
				</tr>
			</tbody>
		</table>
	</div>
{:else}
	<div class="text-muted-foreground text-sm">Loading…</div>
{/if}
