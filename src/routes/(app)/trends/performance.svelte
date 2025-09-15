<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import { formatCurrency } from '$lib/components/currency';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
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

	function utcEndOfDay(d: Date) {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
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
		// Use a max future timestamp for "current" so we always pick the latest known value
		const now = new Date(8640000000000000);

		let earliest: Date | null = null;
		for (const b of rawAccountBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}
		for (const b of rawAssetBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}

		const atDates = periods.map((p) => {
			if (p.offset.max) return earliest ? new Date(earliest) : now; // exact first record for MAX
			if (p.offset.ytd) return utcEndOfDay(new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
			// For other offsets, use end-of-day of the computed anchor to include that day's changes
			const anchor = subDate(new Date(), p.offset);
			return utcEndOfDay(anchor);
		});
		const totals = computeTotals([...atDates, now]);
		const current = totals[totals.length - 1];

		// For MAX, compute each group's baseline as the first non-zero total for that group
		const allTimes = [
			...rawAccountBalances.map((b) => new Date(b.asOf).getTime()),
			...rawAssetBalances.map((b) => new Date(b.asOf).getTime())
		];
		const uniqueAscTimes = Array.from(new Set(allTimes)).sort((a, b) => a - b);
		const totalsAll = computeTotals(uniqueAscTimes.map((t) => new Date(t)));
		let baseline = { net: 0, cash: 0, debt: 0, investment: 0, other: 0 };
		for (const row of totalsAll) {
			if (baseline.net === 0 && row.net !== 0) baseline.net = row.net;
			if (baseline.cash === 0 && row.cash !== 0) baseline.cash = row.cash;
			if (baseline.debt === 0 && row.debt !== 0) baseline.debt = row.debt;
			if (baseline.investment === 0 && row.investment !== 0) baseline.investment = row.investment;
			if (baseline.other === 0 && row.other !== 0) baseline.other = row.other;
			if (
				baseline.net !== 0 &&
				baseline.cash !== 0 &&
				baseline.debt !== 0 &&
				baseline.investment !== 0 &&
				baseline.other !== 0
			)
				break;
		}

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
				values: p.offset.max
					? {
							net: {
								pct: pctDiff(current.net, baseline.net),
								cur: current.net,
								prev: baseline.net
							},
							cash: {
								pct: pctDiff(current.cash, baseline.cash),
								cur: current.cash,
								prev: baseline.cash
							},
							debt: {
								pct: pctDiff(current.debt, baseline.debt),
								cur: current.debt,
								prev: baseline.debt
							},
							investment: {
								pct: pctDiff(current.investment, baseline.investment),
								cur: current.investment,
								prev: baseline.investment
							},
							other: {
								pct: pctDiff(current.other, baseline.other),
								cur: current.other,
								prev: baseline.other
							}
						}
					: {
							net: { pct: pctDiff(current.net, past.net), cur: current.net, prev: past.net },
							cash: { pct: pctDiff(current.cash, past.cash), cur: current.cash, prev: past.cash },
							debt: { pct: pctDiff(current.debt, past.debt), cur: current.debt, prev: past.debt },
							investment: {
								pct: pctDiff(current.investment, past.investment),
								cur: current.investment,
								prev: past.investment
							},
							other: {
								pct: pctDiff(current.other, past.other),
								cur: current.other,
								prev: past.other
							}
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
		if (v === null) return '~';
		return new Intl.NumberFormat('en-US', {
			style: 'percent',
			maximumFractionDigits: 1,
			signDisplay: 'exceptZero'
		}).format(v);
	}

	function pctClass(v: number | null, group: 'net' | 'cash' | 'debt' | 'investment' | 'other') {
		if (v === null) return 'text-muted-foreground';
		if (v === 0) return '';
		const reversed = group === 'debt';
		const positive = v > 0;
		if (reversed) return positive ? 'text-debt' : 'text-cash';
		return positive ? 'text-cash' : 'text-debt';
	}
</script>

{#if table}
	<div class="bg-background rounded-sm shadow-md">
		<div class="overflow-x-auto">
			<Tooltip.Provider delayDuration={150}>
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
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										pctClass(c.values.net.pct, 'net')}
								>
									{#if c.values.net.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{fmtPct(c.values.net.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													From <span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.net.prev, { maximumFractionDigits: 2 })}</span
													>
													to
													<span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.net.cur, { maximumFractionDigits: 2 })}</span
													>
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="font-jetbrains-mono text-muted-foreground text-right text-xs">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{fmtPct(table.allocation.net)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.net, { maximumFractionDigits: 2 })}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-medium">Cash</Table.Cell>
							{#each table.cols as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										pctClass(c.values.cash.pct, 'cash')}
								>
									{#if c.values.cash.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{fmtPct(c.values.cash.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													From <span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.cash.prev, {
															maximumFractionDigits: 2
														})}</span
													>
													to
													<span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.cash.cur, { maximumFractionDigits: 2 })}</span
													>
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="font-jetbrains-mono text-right text-xs">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{fmtPct(table.allocation.cash)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.cash, { maximumFractionDigits: 2 })}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-medium">Debt</Table.Cell>
							{#each table.cols as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										pctClass(c.values.debt.pct, 'debt')}
								>
									{#if c.values.debt.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{fmtPct(c.values.debt.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													From <span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.debt.prev, {
															maximumFractionDigits: 2
														})}</span
													>
													to
													<span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.debt.cur, { maximumFractionDigits: 2 })}</span
													>
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="font-jetbrains-mono text-right text-xs">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{fmtPct(table.allocation.debt)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.debt, { maximumFractionDigits: 2 })}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-medium">Investments</Table.Cell>
							{#each table.cols as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										pctClass(c.values.investment.pct, 'investment')}
								>
									{#if c.values.investment.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{fmtPct(c.values.investment.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													From <span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.investment.prev, {
															maximumFractionDigits: 2
														})}</span
													>
													to
													<span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.investment.cur, {
															maximumFractionDigits: 2
														})}</span
													>
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="font-jetbrains-mono text-right text-xs">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{fmtPct(table.allocation.investment)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.investment, { maximumFractionDigits: 2 })}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-medium">Other assets</Table.Cell>
							{#each table.cols as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										pctClass(c.values.other.pct, 'other')}
								>
									{#if c.values.other.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{fmtPct(c.values.other.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													From <span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.other.prev, {
															maximumFractionDigits: 2
														})}</span
													>
													to
													<span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.other.cur, {
															maximumFractionDigits: 2
														})}</span
													>
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="font-jetbrains-mono text-right text-xs">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{fmtPct(table.allocation.other)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.other, { maximumFractionDigits: 2 })}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
					</Table.Body>
				</Table.Root>
			</Tooltip.Provider>
		</div>
	</div>
{:else}
	<Skeleton class="h-64 w-full" />
{/if}
