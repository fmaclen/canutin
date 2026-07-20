<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { eachDayOfInterval } from 'date-fns';
	import { onDestroy } from 'svelte';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import {
		advanceTrendSecurityValue,
		type TrendSecurityBalance,
		type TrendSecurityValueState
	} from '$lib/balance-series';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import Empty from '$lib/components/empty.svelte';
	import FilterBar from '$lib/components/filter-bar.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Page from '$lib/components/page.svelte';
	import PositionsTable from '$lib/components/positions-table.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import TimeSeriesChart from '$lib/components/time-series-chart.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SecurityBalancesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext, type SecurityAggregate } from '$lib/securities.svelte';
	import { gainLossPercentOrNull } from '$lib/security-balance-values';
	import { projectSignedValue } from '$lib/sharing';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, sumPartial, type SortState } from '$lib/utils';

	import AllocationTreemap from './allocation-treemap.svelte';

	const securitiesContext = getSecuritiesContext();
	const accountsContext = getAccountsContext();
	const fx = getExchangeRatesContext();
	const pb = getPocketBaseContext();

	// Raw state: replaced wholesale on every fetch and only read by buildValueSeries, which
	// walks every balance daily - deep proxies would tax each of those property reads.
	let securityBalanceHistory: TrendSecurityBalance[] = $state.raw([]);
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

	// Market value per day, account-agnostic: each account+security position is forward-filled
	// from the first balance to today, converted to the display currency at its own balance date,
	// and summed. Unconvertible values are skipped with no unconverted indicator on the chart -
	// the Net market value tile below already carries the FX warning.
	function buildValueSeries(history: TrendSecurityBalance[]) {
		if (history.length === 0) return [];
		const accountById = new Map(accountsContext.accounts.map((account) => [account.id, account]));
		const currencyBySecurity = new Map(
			securitiesContext.securities.map((security) => [security.id, security.currency])
		);
		const balancesByKey = Map.groupBy(
			history,
			(balance) => `${balance.account}:${balance.security}`
		);
		const positions = [...balancesByKey.values()].map((balances) => {
			const state: TrendSecurityValueState = { index: -1, lastKnownValue: null, soldOut: false };
			return { balances, state };
		});
		const datePoints = eachDayOfInterval({
			start: new UTCDate(new Date(history[0].asOf).getTime()),
			end: new UTCDate()
		});
		return datePoints.map((datePoint) => {
			let value = 0;
			for (const { balances, state } of positions) {
				const account = accountById.get(balances[0].account);
				if (!account) continue;
				if (account.closed && datePoint >= new Date(account.closed)) continue;
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
	}

	const valueSeries = $derived(buildValueSeries(securityBalanceHistory));

	let accountFilter = $state<string | null>(null);
	let search = $state('');
	let filteredSearch = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

	afterNavigate(({ to }) => {
		if (to?.url.pathname !== resolve('/portfolio')) return;
		syncFromUrl(to.url);
	});

	$effect(() => {
		if (accountsContext.isLoading) return;
		syncFromUrl(new URL(window.location.href));
	});

	function syncFromUrl(url: URL) {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		search = url.searchParams.get('q') ?? '';
		filteredSearch = search;
		const accountParam = url.searchParams.get('account');
		accountFilter =
			accountParam &&
			(accountsContext.isLoading ||
				accountsContext.accounts.some((account) => account.id === accountParam))
				? accountParam
				: null;
	}

	function setSearch(query: string) {
		search = query;
		const url = new URL(window.location.href);
		if (query.trim()) url.searchParams.set('q', query.trim());
		else url.searchParams.delete('q');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL preserves other params
		replaceState(url.href, {});

		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			filteredSearch = query;
		}, 300);
	}

	onDestroy(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
	});

	function setAccountFilter(accountId: string | null) {
		accountFilter = accountId;
		const url = new URL(window.location.href);
		if (accountId) url.searchParams.set('account', accountId);
		else url.searchParams.delete('account');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL preserves other params
		replaceState(url.href, {});
	}

	const selectedAccount = $derived(
		accountFilter ? accountsContext.accounts.find((account) => account.id === accountFilter) : null
	);
	const accountRows = $derived(securitiesContext.getAggregateRows(accountFilter));
	const searchTerms = $derived(
		filteredSearch
			.toLocaleLowerCase()
			.split(/[\s,]+/)
			.filter(Boolean)
	);
	const rows = $derived(
		searchTerms.length
			? accountRows.filter((row) =>
					searchTerms.some(
						(term) =>
							row.name.toLocaleLowerCase().includes(term) ||
							row.symbol?.toLocaleLowerCase().includes(term)
					)
				)
			: accountRows
	);
	const totalRows = $derived(rows.flatMap((row) => row.balances));
	const marketValueTotal = $derived(
		sumPartial(totalRows.map((row) => (row.isUnconverted ? null : row.value)))
	);
	const gainLossTotal = $derived(
		sumPartial(totalRows.map((row) => (row.isUnconverted ? null : row.gainLoss)))
	);
	const costBasisTotal = $derived(
		sumPartial(totalRows.map((row) => (row.isUnconverted ? null : row.costBasis)))
	);
	const gainPercent = $derived(gainLossPercentOrNull(gainLossTotal.total, costBasisTotal.total));

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
</script>

<Page pageTitle={m.portfolio_page_title()}>
	<Section>
		<SectionTitle title={m.portfolio_section_positions()} />
		{#if securitiesContext.isLoading}
			<Skeleton class="h-64" showSpinner />
		{:else}
			<FilterBar
				{search}
				isLoading={false}
				searchPlaceholder={m.portfolio_search_placeholder()}
				{setSearch}
			>
				{#snippet controls()}
					<AccountPicker
						accounts={accountsContext.accounts}
						value={accountFilter ?? ''}
						{selectedAccount}
						onValueChange={(value) => setAccountFilter(value || null)}
						onClear={() => setAccountFilter(null)}
						clearLabel={m.transactions_filter_account_clear()}
						ariaLabel={m.transactions_filter_account_label()}
						triggerClass="sm:w-fit sm:max-w-64"
						selectedNameClass="max-w-40 truncate"
						placeholder={m.transactions_filter_account_all()}
					/>
				{/snippet}
			</FilterBar>
			{#if rows.length === 0}
				<Empty>{accountRows.length === 0 ? m.portfolio_empty() : m.portfolio_table_empty()}</Empty>
			{:else}
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<KeyValue
						title={m.summary_net_gain_loss()}
						value={gainLossTotal.total}
						variant="outline"
						decimalScale={2}
						isPartial={gainLossTotal.isPartial}
					/>
					<KeyValue
						title={m.summary_net_gain_percent()}
						value={gainPercent}
						variant="outline"
						format="percent"
						isPartial={gainLossTotal.isPartial || costBasisTotal.isPartial}
					/>
					<KeyValue
						title={m.summary_net_market_value()}
						value={marketValueTotal.total}
						variant="outline"
						decimalScale={2}
						isPartial={marketValueTotal.isPartial}
					/>
				</div>
				<PositionsTable
					rows={sortedRows}
					entity="aggregate"
					sortState={sort.state}
					onSort={sort.toggle}
				/>
			{/if}
		{/if}
	</Section>

	<div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
		<Section>
			<TimeSeriesChart
				title={m.market_value_section_title()}
				isLoading={securitiesContext.isLoading ||
					accountsContext.isLoading ||
					balanceHistoryLoading}
				rows={valueSeries}
				period="max"
				series={[
					{
						key: 'value',
						label: m.market_value_series_label(),
						color: 'var(--brand)',
						value: (point) => point.value
					}
				]}
				emptyMessage={m.market_value_empty()}
				formatAxisValue={(value) => formatCurrency(Math.round(value))}
				formatTooltipValue={(value) => formatCurrency(value, 2)}
			/>
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
	</div>
</Page>
