<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import * as Table from '$lib/components/ui/table/index';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';

	import Skeleton from '../ui/skeleton/skeleton.svelte';

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

	const prepared = $derived.by(() => {
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
		return {
			acctMap,
			assetMap,
			accountById: new Map(rawAccounts.map((a) => [a.id, a] as const)),
			assetById: new Map(rawAssets.map((a) => [a.id, a] as const))
		};
	});

	function computeTotals(atDates: Date[]) {
		const { acctMap, assetMap, accountById, assetById } = prepared;
		const asc = [...atDates].sort((a, b) => a.getTime() - b.getTime());
		const ascIndex = new Map(asc.map((d, i) => [d.getTime(), i] as const));
		const sumsAsc = asc.map(() => ({ net: 0, cash: 0, debt: 0, investment: 0, other: 0 }));

		for (const [id, arr] of acctMap) {
			const meta = accountById.get(id);
			if (!meta) continue;
			let p = -1;
			for (let j = 0; j < asc.length; j++) {
				const t = asc[j];
				while (p + 1 < arr.length && new Date(arr[p + 1].asOf) <= t) p++;
				const val = p >= 0 ? (arr[p].value ?? 0) : 0;
				const g = meta.balanceGroup as BalanceGroup;
				if (g === 'CASH') sumsAsc[j].cash += val;
				else if (g === 'DEBT') sumsAsc[j].debt += val;
				else if (g === 'INVESTMENT') sumsAsc[j].investment += val;
				else sumsAsc[j].other += val;
				sumsAsc[j].net += val;
			}
		}
		for (const [id, arr] of assetMap) {
			const meta = assetById.get(id);
			if (!meta) continue;
			let p = -1;
			for (let j = 0; j < asc.length; j++) {
				const t = asc[j];
				while (p + 1 < arr.length && new Date(arr[p + 1].asOf) <= t) p++;
				const val = p >= 0 ? (arr[p].value ?? 0) : 0;
				const g = meta.balanceGroup as BalanceGroup;
				if (g === 'CASH') sumsAsc[j].cash += val;
				else if (g === 'DEBT') sumsAsc[j].debt += val;
				else if (g === 'INVESTMENT') sumsAsc[j].investment += val;
				else sumsAsc[j].other += val;
				sumsAsc[j].net += val;
			}
		}

		return atDates.map((d) => sumsAsc[ascIndex.get(d.getTime())!]);
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

		const atDates = periods.map((p) =>
			p.offset.max
				? earliest
					? utcMidnight(earliest)
					: now
				: p.offset.ytd
					? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
					: subDate(now, p.offset)
		);
		const totals = computeTotals([...atDates, now]);
		const current = totals[totals.length - 1];
		const cols = periods.map((p, i) => {
			const past = totals[i];

			function pctDiff(cur: number, prev: number) {
				if (!prev || prev === 0) return null as number | null;
				return (cur - prev) / Math.abs(prev);
			}

			return {
				key: p.key,
				label: p.label,
				at: atDates[i],
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
	<div class="bg-background rounded-sm shadow-md">
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="text-left">Group</Table.Head>
						{#each table.cols as c (c.key)}
							<Table.Head class="text-right whitespace-nowrap">{c.label}</Table.Head>
						{/each}
						<Table.Head class="text-right whitespace-nowrap">Allocation</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					<Table.Row>
						<Table.Cell class="font-medium">Net worth</Table.Cell>
						{#each table.cols as c (c.key)}
							<Table.Cell class="font-jetbrains-mono text-right text-xs"
								>{fmtPct(c.values.net)}</Table.Cell
							>
						{/each}
						<Table.Cell class="font-jetbrains-mono text-right text-xs"
							>{fmtPct(table.allocation.net)}</Table.Cell
						>
					</Table.Row>
					<Table.Row>
						<Table.Cell class="font-medium">Cash</Table.Cell>
						{#each table.cols as c (c.key)}
							<Table.Cell class="font-jetbrains-mono text-right text-xs"
								>{fmtPct(c.values.cash)}</Table.Cell
							>
						{/each}
						<Table.Cell class="font-jetbrains-mono text-right text-xs"
							>{fmtPct(table.allocation.cash)}</Table.Cell
						>
					</Table.Row>
					<Table.Row>
						<Table.Cell class="font-medium">Debt</Table.Cell>
						{#each table.cols as c (c.key)}
							<Table.Cell class="font-jetbrains-mono text-right text-xs"
								>{fmtPct(c.values.debt)}</Table.Cell
							>
						{/each}
						<Table.Cell class="font-jetbrains-mono text-right text-xs"
							>{fmtPct(table.allocation.debt)}</Table.Cell
						>
					</Table.Row>
					<Table.Row>
						<Table.Cell class="font-medium">Investments</Table.Cell>
						{#each table.cols as c (c.key)}
							<Table.Cell class="font-jetbrains-mono text-right text-xs"
								>{fmtPct(c.values.investment)}</Table.Cell
							>
						{/each}
						<Table.Cell class="font-jetbrains-mono text-right text-xs"
							>{fmtPct(table.allocation.investment)}</Table.Cell
						>
					</Table.Row>
					<Table.Row>
						<Table.Cell class="font-medium">Other assets</Table.Cell>
						{#each table.cols as c (c.key)}
							<Table.Cell class="font-jetbrains-mono text-right text-xs"
								>{fmtPct(c.values.other)}</Table.Cell
							>
						{/each}
						<Table.Cell class="font-jetbrains-mono text-right text-xs"
							>{fmtPct(table.allocation.other)}</Table.Cell
						>
					</Table.Row>
				</Table.Body>
			</Table.Root>
		</div>
	</div>
{:else}
	<Skeleton class="h-96 w-full" />
{/if}
