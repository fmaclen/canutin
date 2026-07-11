<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { endOfDay, startOfYear, sub } from 'date-fns';

	import {
		advanceTrendSecurityValue,
		type TrendSecurityBalance,
		type TrendSecurityValueState
	} from '$lib/balance-series';
	import { formatCurrency } from '$lib/components/currency';
	import Empty from '$lib/components/empty.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';

	import { findEarliestBalanceDate, type BalanceGroup, type PreparedTrendMaps } from './trends';

	let {
		isLoading,
		prepared,
		fullHistoryPrepared,
		rawAccounts,
		rawAssets,
		rawFullHistoryAccountBalances,
		rawFullHistorySecurityBalances,
		rawFullHistoryAssetBalances
	}: {
		isLoading: boolean;
		prepared: PreparedTrendMaps;
		fullHistoryPrepared: PreparedTrendMaps;
		rawAccounts: AccountsResponse[];
		rawAssets: AssetsResponse[];
		rawFullHistoryAccountBalances: AccountBalancesResponse[];
		rawFullHistorySecurityBalances: TrendSecurityBalance[];
		rawFullHistoryAssetBalances: AssetBalancesResponse[];
	} = $props();

	const fx = getExchangeRatesContext();
	const isEmpty = $derived(!rawAccounts.length && !rawAssets.length);

	type GroupKey = 'net' | 'cash' | 'debt' | 'investment' | 'other';
	// NOTE: trends hides the converted-amount indicator (page-scoped FX rule), so only the
	// unconvertible warning is tracked per group; the converted values themselves are unchanged.
	type FxFlags = { isUnconverted: boolean };
	type Totals = Record<GroupKey, number> & { fx: Record<GroupKey, FxFlags> };

	function freshTotals() {
		return {
			net: 0,
			cash: 0,
			debt: 0,
			investment: 0,
			other: 0,
			fx: {
				net: { isUnconverted: false },
				cash: { isUnconverted: false },
				debt: { isUnconverted: false },
				investment: { isUnconverted: false },
				other: { isUnconverted: false }
			}
		};
	}

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
		totals: Totals,
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
		if (!conversion.isUnconverted) {
			totals[key] += value;
			totals.net += value;
		}
		for (const groupKey of [key, 'net'] as const) {
			totals.fx[groupKey] = {
				isUnconverted: totals.fx[groupKey].isUnconverted || conversion.isUnconverted
			};
		}
	}

	function combineFx(a: FxFlags, b: FxFlags) {
		return {
			isUnconverted: a.isUnconverted || b.isUnconverted
		};
	}

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
			assetById,
			securityCurrencyById
		} = maps;
		const ascendingDates = [...anchorDates].sort((a, b) => a.getTime() - b.getTime());
		const indexByTime = new Map(
			ascendingDates.map((date, index) => [date.getTime(), index] as const)
		);
		const totalsAscending = ascendingDates.map(() => freshTotals());

		for (const [accountId, balances] of accountBalancesByAccountId) {
			const meta = accountById.get(accountId);
			if (!meta) continue;
			let pointer = -1;
			for (let dateIndex = 0; dateIndex < ascendingDates.length; dateIndex++) {
				const datePoint = ascendingDates[dateIndex];
				while (pointer + 1 < balances.length && new Date(balances[pointer + 1].asOf) <= datePoint)
					pointer++;
				const conversion = convertSnapshot(
					balances,
					pointer,
					(balance) => balance.value ?? 0,
					meta.currency,
					meta.closed,
					datePoint
				);
				accumulateGroup(
					totalsAscending[dateIndex],
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion
				);
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
				const rawValue = advanceTrendSecurityValue(balances, datePoint, securityValueState);
				if (rawValue === null) continue;
				// NOTE: securities load from a different context than these balances, so their currency
				// map can briefly lag; fall back to the account's currency so all-USD data stays
				// unconverted instead of flashing an FX indicator during that window.
				const conversion = fx.convert(
					rawValue,
					securityCurrencyById.get(balances[0].security) ?? meta.currency,
					balances[securityValueState.index].asOf
				);
				accumulateGroup(
					totalsAscending[dateIndex],
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion
				);
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
				const conversion = convertSnapshot(
					balances,
					pointer,
					(balance) => balance.marketValue ?? 0,
					meta.currency,
					meta.sold,
					datePoint
				);
				accumulateGroup(
					totalsAscending[dateIndex],
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion
				);
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
		const END_OF_TIME = new Date('9999-12-31T23:59:59.999Z');
		const now = END_OF_TIME;

		const boundedPeriods = periods.filter((periodDef) => !periodDef.offset.max);
		const anchorDates = boundedPeriods.map((periodDef) => {
			if (periodDef.offset.ytd) return endOfDay(startOfYear(new UTCDate()));
			const anchorDate = sub(new UTCDate(), periodDef.offset);
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
		const baseline = freshTotals();
		const baselineFilled: Record<GroupKey, boolean> = {
			net: false,
			cash: false,
			debt: false,
			investment: false,
			other: false
		};
		for (const row of totalsAll) {
			for (const key of Object.keys(baselineFilled) as GroupKey[]) {
				if (baselineFilled[key] || row[key] === 0) continue;
				baseline[key] = row[key];
				baseline.fx[key] = row.fx[key];
				baselineFilled[key] = true;
			}
			if (Object.values(baselineFilled).every(Boolean)) break;
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
							prev: baseline.net,
							fx: combineFx(fullHistoryCurrent.fx.net, baseline.fx.net)
						},
						cash: {
							pct: percentChange(fullHistoryCurrent.cash, baseline.cash),
							cur: fullHistoryCurrent.cash,
							prev: baseline.cash,
							fx: combineFx(fullHistoryCurrent.fx.cash, baseline.fx.cash)
						},
						debt: {
							pct: percentChangeDebtMagnitude(fullHistoryCurrent.debt, baseline.debt),
							cur: fullHistoryCurrent.debt,
							prev: baseline.debt,
							fx: combineFx(fullHistoryCurrent.fx.debt, baseline.fx.debt)
						},
						investment: {
							pct: percentChange(fullHistoryCurrent.investment, baseline.investment),
							cur: fullHistoryCurrent.investment,
							prev: baseline.investment,
							fx: combineFx(fullHistoryCurrent.fx.investment, baseline.fx.investment)
						},
						other: {
							pct: percentChange(fullHistoryCurrent.other, baseline.other),
							cur: fullHistoryCurrent.other,
							prev: baseline.other,
							fx: combineFx(fullHistoryCurrent.fx.other, baseline.fx.other)
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
						prev: previousTotals.net,
						fx: combineFx(current.fx.net, previousTotals.fx.net)
					},
					cash: {
						pct: percentChange(current.cash, previousTotals.cash),
						cur: current.cash,
						prev: previousTotals.cash,
						fx: combineFx(current.fx.cash, previousTotals.fx.cash)
					},
					debt: {
						pct: percentChangeDebtMagnitude(current.debt, previousTotals.debt),
						cur: current.debt,
						prev: previousTotals.debt,
						fx: combineFx(current.fx.debt, previousTotals.fx.debt)
					},
					investment: {
						pct: percentChange(current.investment, previousTotals.investment),
						cur: current.investment,
						prev: previousTotals.investment,
						fx: combineFx(current.fx.investment, previousTotals.fx.investment)
					},
					other: {
						pct: percentChange(current.other, previousTotals.other),
						cur: current.other,
						prev: previousTotals.other,
						fx: combineFx(current.fx.other, previousTotals.fx.other)
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
		return new Intl.NumberFormat(getFormattingLocale(), {
			style: 'percent',
			maximumFractionDigits: 1,
			signDisplay: 'exceptZero'
		}).format(v);
	}

	function percentClassName(v: number | null, group: GroupKey) {
		if (v === null) return 'text-muted-foreground';
		if (v === 0) return '';
		const reversed = group === 'debt';
		const positive = v > 0;
		if (reversed) return positive ? 'text-debt' : 'text-cash';
		return positive ? 'text-cash' : 'text-debt';
	}
</script>

{#snippet pctCell(pct: number | null, prev: number, cur: number, flags: FxFlags)}
	{#if pct === null}
		<span class="text-muted-foreground">~</span>
	{:else if flags.isUnconverted}
		<Tooltip.Root>
			<Tooltip.Trigger
				class="border-border text-muted-foreground inline-block border-b border-dashed leading-none hover:border-current"
				>{formatPercent(pct)}</Tooltip.Trigger
			>
			<Tooltip.Content sideOffset={6}>
				<div class="grid gap-1">
					<p class="text-xs leading-snug font-normal">{m.fx_includes_unconverted()}</p>
					<p class="text-sm">
						{m.trends_performance_tooltip_range({
							prev: formatCurrency(prev, 2),
							cur: formatCurrency(cur, 2)
						})}
					</p>
				</div>
			</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<Tooltip.Root>
			<Tooltip.Trigger
				class="border-border inline-block border-b border-dashed hover:border-current"
				>{formatPercent(pct)}</Tooltip.Trigger
			>
			<Tooltip.Content sideOffset={6}>
				<p class="text-sm">
					{m.trends_performance_tooltip_range({
						prev: formatCurrency(prev, 2),
						cur: formatCurrency(cur, 2)
					})}
				</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
{/snippet}

{#snippet allocationCell(pct: number, currentValue: number, flags: FxFlags, tooltipClass: string)}
	{#if flags.isUnconverted}
		<Tooltip.Root>
			<Tooltip.Trigger
				class="border-border text-muted-foreground inline-block border-b border-dashed leading-none hover:border-current"
				>{formatPercent(pct)}</Tooltip.Trigger
			>
			<Tooltip.Content sideOffset={6}>
				<div class="grid gap-1">
					<p class="text-xs leading-snug font-normal">{m.fx_includes_unconverted()}</p>
					<p class={tooltipClass}>{formatCurrency(currentValue, 2)}</p>
				</div>
			</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<Tooltip.Root>
			<Tooltip.Trigger
				class="border-border inline-block border-b border-dashed hover:border-current"
				>{formatPercent(pct)}</Tooltip.Trigger
			>
			<Tooltip.Content sideOffset={6}>
				<p class={tooltipClass}>{formatCurrency(currentValue, 2)}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
{/snippet}

{#if isLoading}
	<Skeleton class="h-64" showSpinner />
{:else if isEmpty}
	<Empty>{m.trends_empty()}</Empty>
{:else}
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
									{@render pctCell(
										c.values.net.pct,
										c.values.net.prev,
										c.values.net.cur,
										c.values.net.fx
									)}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-muted-foreground text-right font-mono">
								{@render allocationCell(
									table.allocation.net,
									table.current.net,
									table.current.fx.net,
									'text-sm'
								)}
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.cash}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.cash.pct, 'cash')}
								>
									{@render pctCell(
										c.values.cash.pct,
										c.values.cash.prev,
										c.values.cash.cur,
										c.values.cash.fx
									)}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								{@render allocationCell(
									table.allocation.cash,
									table.current.cash,
									table.current.fx.cash,
									'text-sm'
								)}
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.debt}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.debt.pct, 'debt')}
								>
									{@render pctCell(
										c.values.debt.pct,
										c.values.debt.prev,
										c.values.debt.cur,
										c.values.debt.fx
									)}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								{@render allocationCell(
									table.allocation.debt,
									table.current.debt,
									table.current.fx.debt,
									'font-normal'
								)}
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.investment}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' +
										percentClassName(c.values.investment.pct, 'investment')}
								>
									{@render pctCell(
										c.values.investment.pct,
										c.values.investment.prev,
										c.values.investment.cur,
										c.values.investment.fx
									)}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								{@render allocationCell(
									table.allocation.investment,
									table.current.investment,
									table.current.fx.investment,
									'font-normal'
								)}
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="text-sm font-medium">{rowLabels.other}</Table.Cell>
							{#each table.columns as c (c.key)}
								<Table.Cell
									class={'text-right font-mono ' + percentClassName(c.values.other.pct, 'other')}
								>
									{@render pctCell(
										c.values.other.pct,
										c.values.other.prev,
										c.values.other.cur,
										c.values.other.fx
									)}
								</Table.Cell>
							{/each}
							<Table.Cell class="text-right font-mono">
								{@render allocationCell(
									table.allocation.other,
									table.current.other,
									table.current.fx.other,
									'font-normal'
								)}
							</Table.Cell>
						</Table.Row>
					</Table.Body>
				</Table.Root>
			</Tooltip.Provider>
		</div>
	</div>
{/if}
