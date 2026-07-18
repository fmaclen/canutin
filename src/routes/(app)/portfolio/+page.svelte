<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { eachDayOfInterval } from 'date-fns';
	import { SvelteMap } from 'svelte/reactivity';

	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import {
		advanceTrendSecurityValue,
		type TrendSecurityBalance,
		type TrendSecurityValueState
	} from '$lib/balance-series';
	import BalanceHistoryChart from '$lib/components/balance-history-chart.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SecurityBalancesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext, type SecurityAggregate } from '$lib/securities.svelte';
	import {
		formatSecurityQuantity,
		gainLossPercentOrNull,
		sentiment
	} from '$lib/security-balance-values';
	import { projectSignedValue } from '$lib/sharing';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, formatPercent, type SortState } from '$lib/utils';

	import AllocationTreemap from './allocation-treemap.svelte';

	const securitiesContext = getSecuritiesContext();
	const accountsContext = getAccountsContext();
	const fx = getExchangeRatesContext();
	const pb = getPocketBaseContext();

	let securityBalanceHistory: TrendSecurityBalance[] = $state([]);
	let balanceHistoryLoading = $state(true);

	$effect(() => {
		// The securities context whole-cache-replaces `securities` on every realtime refresh, so
		// tracking it here refetches the history in step with the positions table; only the first
		// load shows the skeleton - later refetches replace the series silently. While the context
		// is still loading its first commit, skip the fetch - it would run against the empty cache
		// and be immediately superseded.
		if (securitiesContext.isLoading) return;
		void securitiesContext.securities;
		let cancelled = false;
		pb.authedClient
			.collection('securityBalances')
			.getFullList<SecurityBalancesResponse<number, number, number, number>>({
				sort: 'asOf,created,id',
				fields: 'id,account,security,value,quantity,asOf,created',
				requestKey: null
			})
			.then((records) => {
				if (cancelled) return;
				securityBalanceHistory = records;
				balanceHistoryLoading = false;
			})
			.catch((error) => {
				if (cancelled) return;
				pb.handleConnectionError(error, 'portfolio', 'balance_history');
				balanceHistoryLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	// Total securities market value per day, account-agnostic: each account+security position is
	// forward-filled from the first balance to today, converted to the display currency at its own
	// balance date, and summed. Unconvertible values are skipped with no unconverted indicator on
	// the chart - the Net market value tile below already carries the FX warning.
	const valueSeries = $derived.by(() => {
		if (securityBalanceHistory.length === 0) return [];
		const accountById = new SvelteMap(
			accountsContext.accounts.map((account) => [account.id, account])
		);
		const currencyBySecurity = new SvelteMap(
			securitiesContext.securities.map((security) => [security.id, security.currency])
		);
		const balancesByKey = new SvelteMap<string, TrendSecurityBalance[]>();
		for (const balance of securityBalanceHistory) {
			const key = `${balance.account}:${balance.security}`;
			const group = balancesByKey.get(key) ?? [];
			group.push(balance);
			balancesByKey.set(key, group);
		}
		const states = new SvelteMap<string, TrendSecurityValueState>();
		const datePoints = eachDayOfInterval({
			start: new UTCDate(new Date(securityBalanceHistory[0].asOf).getTime()),
			end: new UTCDate()
		});
		return datePoints.map((datePoint) => {
			let value = 0;
			for (const [key, balances] of balancesByKey) {
				const account = accountById.get(balances[0].account);
				if (!account) continue;
				if (account.closed && datePoint >= new Date(account.closed)) continue;
				const state = states.get(key) ?? { index: -1, lastKnownValue: null, soldOut: false };
				states.set(key, state);
				const rawValue = advanceTrendSecurityValue(balances, datePoint, state);
				if (rawValue === null) continue;
				const conversion = fx.convert(
					projectSignedValue(rawValue, account.perspective),
					currencyBySecurity.get(balances[0].security) ?? account.currency,
					balances[state.index].asOf
				);
				if (!conversion.isUnconverted) value += conversion.value;
			}
			return { date: datePoint, value };
		});
	});

	// NOTE: aggregateRows already carries its own display-currency conversion (value/costBasis/
	// gainLoss + isConverted/isUnconverted); this just sorts and sums those.
	const rows = $derived(securitiesContext.aggregateRows);

	// The treemap can only size known, positive market values; unknown (~) and zero-value
	// positions stay visible in the table below.
	const allocationRows = $derived(rows.filter((row) => row.value !== null && row.value > 0));

	let allocationMode: 'value' | 'gain' = $state('value');

	type PortfolioSortColumn =
		| 'name'
		| 'symbol'
		| 'quantity'
		| 'costBasis'
		| 'gainLoss'
		| 'gainLossPercent'
		| 'value';
	const validSortColumns: PortfolioSortColumn[] = [
		'name',
		'symbol',
		'quantity',
		'costBasis',
		'gainLoss',
		'gainLossPercent',
		'value'
	];

	const defaultSort: SortState<PortfolioSortColumn> = { column: 'value', direction: 'desc' };
	const sort = new TableSort<PortfolioSortColumn>(validSortColumns, defaultSort);

	const sortedRows = $derived.by(() => {
		const comparator = createSortComparator<SecurityAggregate, PortfolioSortColumn>(sort.state, {
			name: (r) => r.name,
			symbol: (r) => r.symbol,
			quantity: (r) => r.quantity,
			costBasis: (r) => r.costBasis,
			gainLoss: (r) => r.gainLoss,
			gainLossPercent: (r) => gainLossPercentOrNull(r.gainLoss, r.costBasis),
			value: (r) => r.value
		});
		return [...rows].sort(comparator);
	});

	const marketValueTotal = $derived(
		rows.some((row) => row.value === null)
			? null
			: rows.reduce((sum, row) => sum + (row.value ?? 0), 0)
	);
	const gainLossTotal = $derived(
		rows.some((row) => row.gainLoss === null)
			? null
			: rows.reduce((sum, row) => sum + (row.gainLoss ?? 0), 0)
	);
	const costBasisTotal = $derived(
		rows.some((row) => row.costBasis === null)
			? null
			: rows.reduce((sum, row) => sum + (row.costBasis ?? 0), 0)
	);
	const returnPercent = $derived(
		gainLossTotal === null || costBasisTotal === null || costBasisTotal === 0
			? null
			: (gainLossTotal / costBasisTotal) * 100
	);
	// NOTE: value/costBasis/gainLoss share one isConverted/isUnconverted pair per row (they're
	// converted from the same security currency + balance date), so one pair covers every total.
	const isTotalsUnconverted = $derived(rows.some((row) => row.isUnconverted));
</script>

<Page pageTitle={m.portfolio_page_title()}>
	<Section>
		<SectionTitle title={m.portfolio_section_positions()} />
		{#if securitiesContext.isLoading}
			<Skeleton class="h-64" showSpinner />
		{:else if rows.length === 0}
			<Empty>{m.portfolio_empty()}</Empty>
		{:else}
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<KeyValue
					title={m.summary_net_gain_loss()}
					value={gainLossTotal}
					variant="outline"
					decimalScale={2}
					isUnconverted={isTotalsUnconverted}
				/>
				<KeyValue
					title={m.summary_net_gain_percent()}
					value={returnPercent}
					variant="outline"
					format="percent"
				/>
				<KeyValue
					title={m.summary_net_market_value()}
					value={marketValueTotal}
					variant="outline"
					decimalScale={2}
					isUnconverted={isTotalsUnconverted}
				/>
			</div>
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="name"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_security()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="symbol"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_symbol()}
							</Table.SortableHead>
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_accounts()}
							</Table.Head>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="quantity"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_quantity()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="costBasis"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_cost_basis()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="gainLoss"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_gain_loss()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="gainLossPercent"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_gain_loss_percent()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="value"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_value()}
							</Table.SortableHead>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each sortedRows as row (row.id)}
							{@const gainLossPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
							<Table.Row>
								<Table.Cell>
									<Link
										href={resolve(`/securities/${row.id}`)}
										class="text-foreground/90 text-sm font-medium"
									>
										{row.name}
									</Link>
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-sm tracking-wide uppercase">
									{#if row.symbol}
										{row.symbol}
									{:else}
										<span class="text-muted-foreground">~</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-foreground/80 max-w-80 text-sm">
									<div class="flex flex-wrap gap-x-1.5 gap-y-0.5">
										{#each row.accounts as account (account.id)}
											<Link
												href={resolve(`/accounts/${account.id}`)}
												class="text-foreground/80 text-sm"
											>
												{account.name}
											</Link>
										{/each}
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.quantity === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<NumberDisplay value={formatSecurityQuantity(row.quantity)} />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.costBasis === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency
											value={row.costBasis}
											decimalScale={2}
											isConverted={row.isConverted}
											isUnconverted={row.isUnconverted}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.gainLoss === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency
											value={row.gainLoss}
											decimalScale={2}
											sentiment={sentiment(row.gainLoss)}
											isConverted={row.isConverted}
											isUnconverted={row.isUnconverted}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if gainLossPercent === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<NumberDisplay
											value={formatPercent(gainLossPercent)}
											sentiment={sentiment(gainLossPercent)}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.value === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency
											value={row.value}
											decimalScale={2}
											sentiment={sentiment(row.value)}
											isConverted={row.isConverted}
											isUnconverted={row.isUnconverted}
										/>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.market_value_section_title()} />
		{#if securitiesContext.isLoading || accountsContext.isLoading || balanceHistoryLoading}
			<Skeleton class="h-[30vh] min-h-96" showSpinner />
		{:else if valueSeries.length >= 2}
			<div class="bg-background overflow-visible rounded-sm shadow-md">
				<BalanceHistoryChart
					points={valueSeries}
					seriesLabel={m.market_value_series_label()}
					formatAxisValue={(value) => formatCurrency(Math.round(value))}
					formatTooltipValue={(value) => formatCurrency(value, 2)}
				/>
			</div>
		{:else}
			<div class="h-[30vh] min-h-96">
				<Empty class="h-full">{m.market_value_empty()}</Empty>
			</div>
		{/if}
	</Section>

	<Tabs.Root bind:value={allocationMode}>
		<Section>
			<SectionTitle title={m.allocation_section_title()}>
				<Tabs.List>
					<Tabs.Trigger value="value">{m.allocation_mode_market_value()}</Tabs.Trigger>
					<Tabs.Trigger value="gain">{m.allocation_mode_gain()}</Tabs.Trigger>
				</Tabs.List>
			</SectionTitle>
			{#if securitiesContext.isLoading}
				<Skeleton class="h-[30vh] min-h-96" showSpinner />
			{:else if allocationRows.length === 0}
				<div class="h-[30vh] min-h-96">
					<Empty class="h-full">{m.allocation_empty()}</Empty>
				</div>
			{:else}
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<AllocationTreemap rows={allocationRows} mode={allocationMode} />
				</div>
			{/if}
		</Section>
	</Tabs.Root>
</Page>
