<script lang="ts">
	import { endOfDay, startOfYear, subDays, subMonths, subYears } from 'date-fns';

	import { formatCurrency } from '$lib/components/currency';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { m } from '$lib/paraglide/messages';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';

	import { buildPreparedMaps, type BalanceGroup } from './trends';

	let {
		rawAccounts = $bindable(),
		rawAssets = $bindable(),
		rawAccountBalances = $bindable(),
		rawAssetBalances = $bindable()
	}: {
		rawAccounts: AccountsResponse[];
		rawAssets: AssetsResponse[];
		rawAccountBalances: AccountBalancesResponse[];
		rawAssetBalances: AssetBalancesResponse[];
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
		{ key: '1w', label: m.trends_performance_period_1w_label(), offset: { days: 7 } },
		{ key: '1m', label: m.trends_performance_period_1m_label(), offset: { months: 1 } },
		{ key: '6m', label: m.trends_period_6m_label(), offset: { months: 6 } },
		{ key: 'ytd', label: m.trends_period_ytd_label(), offset: { ytd: true } },
		{ key: '1y', label: m.trends_period_1y_label(), offset: { years: 1 } },
		{ key: '5y', label: m.trends_period_5y_label(), offset: { years: 5 } },
		{ key: 'max', label: m.trends_period_max_label(), offset: { max: true } }
	];

	function subtractFromDate(now: Date, o: { days?: number; months?: number; years?: number }) {
		let d = now;
		if (o.days) d = subDays(d, o.days);
		if (o.months) d = subMonths(d, o.months);
		if (o.years) d = subYears(d, o.years);
		return d;
	}

	function percentChange(currentValue: number, previousValue: number): number | null {
		if (!previousValue || previousValue === 0) return null;
		return (currentValue - previousValue) / Math.abs(previousValue);
	}

	function percentChangeDebtMagnitude(currentValue: number, previousValue: number): number | null {
		if (!previousValue || previousValue === 0) return null;
		const currentAbs = Math.abs(currentValue);
		const previousAbs = Math.abs(previousValue);
		return (currentAbs - previousAbs) / previousAbs;
	}

	const prepared = $derived.by(() =>
		buildPreparedMaps(rawAccounts, rawAssets, rawAccountBalances, rawAssetBalances)
	);

	function computeTotals(anchorDates: Date[]) {
		const { accountBalancesByAccountId, assetBalancesByAssetId, accountById, assetById } = prepared;
		const ascendingDates = [...anchorDates].sort((a, b) => a.getTime() - b.getTime());
		const indexByTime = new Map(
			ascendingDates.map((date, index) => [date.getTime(), index] as const)
		);
		const totalsAscending = ascendingDates.map(() => ({
			net: 0,
			cash: 0,
			debt: 0,
			investment: 0,
			other: 0
		}));

		for (const [accountId, balances] of accountBalancesByAccountId) {
			const meta = accountById.get(accountId);
			if (!meta) continue;
			let pointer = -1;
			for (let dateIndex = 0; dateIndex < ascendingDates.length; dateIndex++) {
				const datePoint = ascendingDates[dateIndex];
				while (pointer + 1 < balances.length && new Date(balances[pointer + 1].asOf) <= datePoint)
					pointer++;
				const value = pointer >= 0 ? (balances[pointer].value ?? 0) : 0;
				const group = meta.balanceGroup as BalanceGroup;
				if (group === 'CASH') totalsAscending[dateIndex].cash += value;
				else if (group === 'DEBT') totalsAscending[dateIndex].debt += value;
				else if (group === 'INVESTMENT') totalsAscending[dateIndex].investment += value;
				else totalsAscending[dateIndex].other += value;
				totalsAscending[dateIndex].net += value;
			}
		}
		for (const [assetId, balances] of assetBalancesByAssetId) {
			const meta = assetById.get(assetId);
			if (!meta) continue;
			let pointer = -1;
			for (let dateIndex = 0; dateIndex < ascendingDates.length; dateIndex++) {
				const datePoint = ascendingDates[dateIndex];
				while (pointer + 1 < balances.length && new Date(balances[pointer + 1].asOf) <= datePoint)
					pointer++;
				const value = pointer >= 0 ? (balances[pointer].value ?? 0) : 0;
				const group = meta.balanceGroup as BalanceGroup;
				if (group === 'CASH') totalsAscending[dateIndex].cash += value;
				else if (group === 'DEBT') totalsAscending[dateIndex].debt += value;
				else if (group === 'INVESTMENT') totalsAscending[dateIndex].investment += value;
				else totalsAscending[dateIndex].other += value;
				totalsAscending[dateIndex].net += value;
			}
		}

		return anchorDates.map((date) => totalsAscending[indexByTime.get(date.getTime())!]);
	}

	const rowLabels = {
		net: m.trends_series_net_label(),
		cash: m.trends_series_cash_label(),
		debt: m.trends_series_debt_label(),
		investment: m.trends_series_investment_label(),
		other: m.trends_series_other_label()
	};

	const table = $derived.by(() => {
		if (!rawAccounts.length && !rawAssets.length) return null;
		const END_OF_TIME = new Date('9999-12-31T23:59:59.999Z');
		const now = END_OF_TIME;

		let earliest: Date | null = null;
		for (const b of rawAccountBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}
		for (const b of rawAssetBalances) {
			const d = new Date(b.asOf);
			if (!earliest || d < earliest) earliest = d;
		}

		const anchorDates = periods.map((periodDef) => {
			if (periodDef.offset.max) return earliest ? new Date(earliest) : now;
			if (periodDef.offset.ytd) return endOfDay(startOfYear(new Date()));
			const anchorDate = subtractFromDate(new Date(), periodDef.offset);
			return endOfDay(anchorDate);
		});
		const totals = computeTotals([...anchorDates, now]);
		const current = totals[totals.length - 1];

		const allTimes = [
			...rawAccountBalances.map((balance) => new Date(balance.asOf).getTime()),
			...rawAssetBalances.map((balance) => new Date(balance.asOf).getTime())
		];
		const uniqueAscendingTimes = Array.from(new Set(allTimes)).sort((a, b) => a - b);
		const totalsAll = computeTotals(uniqueAscendingTimes.map((timestamp) => new Date(timestamp)));
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

		const columns = periods.map((periodDef, columnIndex) => {
			const previousTotals = totals[columnIndex];

			return {
				key: periodDef.key,
				label: periodDef.label,
				at: anchorDates[columnIndex],
				values: periodDef.offset.max
					? {
							net: {
								pct: percentChange(current.net, baseline.net),
								cur: current.net,
								prev: baseline.net
							},
							cash: {
								pct: percentChange(current.cash, baseline.cash),
								cur: current.cash,
								prev: baseline.cash
							},
							debt: {
								pct: percentChangeDebtMagnitude(current.debt, baseline.debt),
								cur: current.debt,
								prev: baseline.debt
							},
							investment: {
								pct: percentChange(current.investment, baseline.investment),
								cur: current.investment,
								prev: baseline.investment
							},
							other: {
								pct: percentChange(current.other, baseline.other),
								cur: current.other,
								prev: baseline.other
							}
						}
					: {
							net: {
								pct: percentChange(current.net, previousTotals.net),
								cur: current.net,
								prev: previousTotals.net
							},
							cash: {
								pct: percentChange(current.cash, previousTotals.cash),
								cur: current.cash,
								prev: previousTotals.cash
							},
							debt: {
								pct: percentChangeDebtMagnitude(current.debt, previousTotals.debt),
								cur: current.debt,
								prev: previousTotals.debt
							},
							investment: {
								pct: percentChange(current.investment, previousTotals.investment),
								cur: current.investment,
								prev: previousTotals.investment
							},
							other: {
								pct: percentChange(current.other, previousTotals.other),
								cur: current.other,
								prev: previousTotals.other
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

		return { columns, current, allocation };
	});

	function formatPercent(v: number | null) {
		if (v === null) return '~';
		return new Intl.NumberFormat('en-US', {
			style: 'percent',
			maximumFractionDigits: 1,
			signDisplay: 'exceptZero'
		}).format(v);
	}

	function percentClassName(
		v: number | null,
		group: 'net' | 'cash' | 'debt' | 'investment' | 'other'
	) {
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
							<Table.Head class="text-left">{m.trends_performance_header_group()}</Table.Head>
							{#each table.columns as c (c.key)}
								<Table.Head class="text-right whitespace-nowrap">{c.label}</Table.Head>
							{/each}
							<Table.Head class="text-right whitespace-nowrap"
								>{m.trends_performance_header_allocation()}</Table.Head
							>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						<Table.Row>
							<Table.Cell class="font-medium">{rowLabels.net}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										percentClassName(c.values.net.pct, 'net')}
								>
									{#if c.values.net.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{formatPercent(c.values.net.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													{m.trends_performance_tooltip_from()}
													<span class="font-jetbrains-mono tabular-nums"
														>{formatCurrency(c.values.net.prev, { maximumFractionDigits: 2 })}</span
													>
													{m.trends_performance_tooltip_to()}
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
										>{formatPercent(table.allocation.net)}</Tooltip.Trigger
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
							<Table.Cell class="font-medium">{rowLabels.cash}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										percentClassName(c.values.cash.pct, 'cash')}
								>
									{#if c.values.cash.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{formatPercent(c.values.cash.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													{m.trends_performance_tooltip_from()}
													<span class="font-jetbrains-mono tabular-nums"
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
										>{formatPercent(table.allocation.cash)}</Tooltip.Trigger
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
							<Table.Cell class="font-medium">{rowLabels.debt}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										percentClassName(c.values.debt.pct, 'debt')}
								>
									{#if c.values.debt.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{formatPercent(c.values.debt.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													{m.trends_performance_tooltip_from()}
													<span class="font-jetbrains-mono tabular-nums"
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
										>{formatPercent(table.allocation.debt)}</Tooltip.Trigger
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
							<Table.Cell class="font-medium">{rowLabels.investment}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										percentClassName(c.values.investment.pct, 'investment')}
								>
									{#if c.values.investment.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{formatPercent(c.values.investment.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													{m.trends_performance_tooltip_from()}
													<span class="font-jetbrains-mono tabular-nums"
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
										>{formatPercent(table.allocation.investment)}</Tooltip.Trigger
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
							<Table.Cell class="font-medium">{rowLabels.other}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'font-jetbrains-mono text-right text-xs ' +
										percentClassName(c.values.other.pct, 'other')}
								>
									{#if c.values.other.pct === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Tooltip.Root>
											<Tooltip.Trigger
												class="border-border inline-block border-b border-dashed hover:border-current"
												>{formatPercent(c.values.other.pct)}</Tooltip.Trigger
											>
											<Tooltip.Content sideOffset={6}>
												<p class="font-normal">
													{m.trends_performance_tooltip_from()}
													<span class="font-jetbrains-mono tabular-nums"
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
										>{formatPercent(table.allocation.other)}</Tooltip.Trigger
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
