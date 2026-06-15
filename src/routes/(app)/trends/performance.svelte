<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
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

	import {
		advanceTrendSecurityValue,
		findEarliestBalanceDate,
		type BalanceGroup,
		type PreparedTrendMaps,
		type TrendSecurityBalance,
		type TrendSecurityValueState
	} from './trends';

	let {
		prepared,
		fullHistoryPrepared,
		rawAccounts,
		rawAssets,
		rawFullHistoryAccountBalances,
		rawFullHistorySecurityBalances,
		rawFullHistoryAssetBalances
	}: {
		prepared: PreparedTrendMaps;
		fullHistoryPrepared: PreparedTrendMaps;
		rawAccounts: AccountsResponse[];
		rawAssets: AssetsResponse[];
		rawFullHistoryAccountBalances: AccountBalancesResponse[];
		rawFullHistorySecurityBalances: TrendSecurityBalance[];
		rawFullHistoryAssetBalances: AssetBalancesResponse[];
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
		{ key: '6m', label: m.period_6m_label(), offset: { months: 6 } },
		{ key: 'ytd', label: m.period_ytd_label(), offset: { ytd: true } },
		{ key: '1y', label: m.period_1y_label(), offset: { years: 1 } },
		{ key: '2y', label: m.period_2y_label(), offset: { years: 2 } },
		{ key: '5y', label: m.period_5y_label(), offset: { years: 5 } },
		{ key: 'max', label: m.period_max_label(), offset: { max: true } }
	];

	function subtractFromDate(now: Date, o: { days?: number; months?: number; years?: number }) {
		let d = now;
		if (o.days) d = subDays(d, o.days);
		if (o.months) d = subMonths(d, o.months);
		if (o.years) d = subYears(d, o.years);
		return d;
	}

	function percentChange(currentValue: number, previousValue: number) {
		if (!previousValue || previousValue === 0) return null;
		return (currentValue - previousValue) / Math.abs(previousValue);
	}

	function percentChangeDebtMagnitude(currentValue: number, previousValue: number) {
		if (!previousValue || previousValue === 0) return null;
		const currentAbs = Math.abs(currentValue);
		const previousAbs = Math.abs(previousValue);
		return (currentAbs - previousAbs) / previousAbs;
	}

	function computeTotals(maps: PreparedTrendMaps, anchorDates: Date[]) {
		const {
			accountBalancesByAccountId,
			securityBalancesByAccountSecurity,
			assetBalancesByAssetId,
			accountById,
			assetById
		} = maps;
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
				const value =
					meta.closed && datePoint >= new Date(meta.closed)
						? 0
						: pointer >= 0
							? (balances[pointer].value ?? 0)
							: 0;
				const group = meta.balanceGroup as BalanceGroup;
				if (group === 'CASH') totalsAscending[dateIndex].cash += value;
				else if (group === 'DEBT') totalsAscending[dateIndex].debt += value;
				else if (group === 'INVESTMENT') totalsAscending[dateIndex].investment += value;
				else totalsAscending[dateIndex].other += value;
				totalsAscending[dateIndex].net += value;
			}
		}
		for (const balances of securityBalancesByAccountSecurity.values()) {
			const accountId = balances[0]?.account;
			const meta = accountId ? accountById.get(accountId) : null;
			if (!meta) continue;
			const securityValueState = {
				index: -1,
				lastKnownValue: null,
				soldOut: false
			} satisfies TrendSecurityValueState;
			for (let dateIndex = 0; dateIndex < ascendingDates.length; dateIndex++) {
				const datePoint = ascendingDates[dateIndex];
				if (meta.closed && datePoint >= new Date(meta.closed)) continue;
				const value = advanceTrendSecurityValue(balances, datePoint, securityValueState);
				if (value === null) continue;
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
				const value =
					meta.sold && datePoint >= new Date(meta.sold)
						? 0
						: pointer >= 0
							? (balances[pointer].marketValue ?? 0)
							: 0;
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

		const boundedPeriods = periods.filter((periodDef) => !periodDef.offset.max);
		const anchorDates = boundedPeriods.map((periodDef) => {
			if (periodDef.offset.ytd) return endOfDay(startOfYear(new UTCDate()));
			const anchorDate = subtractFromDate(new UTCDate(), periodDef.offset);
			return endOfDay(anchorDate);
		});
		const totals = computeTotals(prepared, [...anchorDates, now]);
		const current = totals[totals.length - 1];

		const allTimes = [
			...rawFullHistoryAccountBalances.map((balance) => new Date(balance.asOf).getTime()),
			...rawFullHistorySecurityBalances.map((balance) => new Date(balance.asOf).getTime()),
			...rawFullHistoryAssetBalances.map((balance) => new Date(balance.asOf).getTime())
		];
		const uniqueAscendingTimes = Array.from(new Set(allTimes)).sort((a, b) => a - b);
		const totalsAll = computeTotals(
			fullHistoryPrepared,
			uniqueAscendingTimes.map((timestamp) => new Date(timestamp))
		);
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

		const fullHistoryCurrent = computeTotals(fullHistoryPrepared, [now])[0];
		const fullHistoryEarliest = findEarliestBalanceDate(
			rawFullHistoryAccountBalances,
			rawFullHistorySecurityBalances,
			rawFullHistoryAssetBalances
		);
		let boundedColumnIndex = 0;
		const columns = periods.map((periodDef) => {
			if (periodDef.offset.max) {
				return {
					key: periodDef.key,
					label: periodDef.label,
					at: fullHistoryEarliest ? new Date(fullHistoryEarliest) : now,
					values: {
						net: {
							pct: percentChange(fullHistoryCurrent.net, baseline.net),
							cur: fullHistoryCurrent.net,
							prev: baseline.net
						},
						cash: {
							pct: percentChange(fullHistoryCurrent.cash, baseline.cash),
							cur: fullHistoryCurrent.cash,
							prev: baseline.cash
						},
						debt: {
							pct: percentChangeDebtMagnitude(fullHistoryCurrent.debt, baseline.debt),
							cur: fullHistoryCurrent.debt,
							prev: baseline.debt
						},
						investment: {
							pct: percentChange(fullHistoryCurrent.investment, baseline.investment),
							cur: fullHistoryCurrent.investment,
							prev: baseline.investment
						},
						other: {
							pct: percentChange(fullHistoryCurrent.other, baseline.other),
							cur: fullHistoryCurrent.other,
							prev: baseline.other
						}
					}
				};
			}

			const previousTotals = totals[boundedColumnIndex];
			const at = anchorDates[boundedColumnIndex];
			boundedColumnIndex++;

			return {
				key: periodDef.key,
				label: periodDef.label,
				at,
				values: {
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
							<Table.Cell class="text-sm font-medium">{rowLabels.net}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.net.pct, 'net')}
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
												<p class="text-sm">
													{m.trends_performance_tooltip_range({
														prev: formatCurrency(c.values.net.prev, 2),
														cur: formatCurrency(c.values.net.cur, 2)
													})}
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-muted-foreground text-right font-mono">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{formatPercent(table.allocation.net)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="text-sm">
											{formatCurrency(table.current.net, 2)}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.cash}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.cash.pct, 'cash')}
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
												<p class="text-sm">
													{m.trends_performance_tooltip_range({
														prev: formatCurrency(c.values.cash.prev, 2),
														cur: formatCurrency(c.values.cash.cur, 2)
													})}
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{formatPercent(table.allocation.cash)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="text-sm">
											{formatCurrency(table.current.cash, 2)}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.debt}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.debt.pct, 'debt')}
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
												<p class="text-sm">
													{m.trends_performance_tooltip_range({
														prev: formatCurrency(c.values.debt.prev, 2),
														cur: formatCurrency(c.values.debt.cur, 2)
													})}
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{formatPercent(table.allocation.debt)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.debt, 2)}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.investment}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' +
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
												<p class="text-sm">
													{m.trends_performance_tooltip_range({
														prev: formatCurrency(c.values.investment.prev, 2),
														cur: formatCurrency(c.values.investment.cur, 2)
													})}
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{formatPercent(table.allocation.investment)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.investment, 2)}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.other}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.other.pct, 'other')}
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
												<p class="text-sm">
													{m.trends_performance_tooltip_range({
														prev: formatCurrency(c.values.other.prev, 2),
														cur: formatCurrency(c.values.other.cur, 2)
													})}
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
										>{formatPercent(table.allocation.other)}</Tooltip.Trigger
									>
									<Tooltip.Content sideOffset={6}>
										<p class="font-normal">
											{formatCurrency(table.current.other, 2)}
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
	<Skeleton class="h-64" />
{/if}
