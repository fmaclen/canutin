<script lang="ts">
	import { onDestroy } from 'svelte';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import Empty from '$lib/components/empty.svelte';
	import FilterBar from '$lib/components/filter-bar.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Page from '$lib/components/page.svelte';
	import PositionsTable from '$lib/components/positions-table.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext, type SecurityAggregate } from '$lib/securities.svelte';
	import { gainLossPercentOrNull } from '$lib/security-balance-values';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, sumPartial, type SortState } from '$lib/utils';

	const securitiesContext = getSecuritiesContext();
	const accountsContext = getAccountsContext();
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
</Page>
