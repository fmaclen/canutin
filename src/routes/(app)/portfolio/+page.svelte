<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Page from '$lib/components/page.svelte';
	import PositionsSummary from '$lib/components/positions-summary.svelte';
	import PositionsTable from '$lib/components/positions-table.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext, type SecurityAggregate } from '$lib/securities.svelte';
	import { gainLossPercentOrNull } from '$lib/security-balance-values';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, type SortState } from '$lib/utils';

	const securitiesContext = getSecuritiesContext();
	const accountsContext = getAccountsContext();
	let accountFilter = $state<string | null>(null);

	afterNavigate(({ to }) => {
		if (to?.url.pathname !== resolve('/portfolio')) return;
		syncFromUrl(to.url);
	});

	$effect(() => {
		if (accountsContext.isLoading) return;
		syncFromUrl(new URL(window.location.href));
	});

	function syncFromUrl(url: URL) {
		const accountParam = url.searchParams.get('account');
		accountFilter =
			accountParam &&
			(accountsContext.isLoading ||
				accountsContext.accounts.some((account) => account.id === accountParam))
				? accountParam
				: null;
	}

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
	const rows = $derived(securitiesContext.getAggregateRows(accountFilter));
	const totalRows = $derived(rows.flatMap((row) => row.balances));

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
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<AccountPicker
					accounts={accountsContext.accounts}
					value={accountFilter ?? ''}
					{selectedAccount}
					onValueChange={(value) => setAccountFilter(value || null)}
					onClear={() => setAccountFilter(null)}
					clearLabel={m.transactions_filter_account_clear()}
					ariaLabel={m.transactions_filter_account_label()}
					triggerClass="bg-background sm:w-fit sm:max-w-64"
					selectedNameClass="max-w-40 truncate"
					placeholder={m.transactions_filter_account_all()}
				/>
			</div>
			{#if rows.length === 0}
				<Empty>{m.portfolio_empty()}</Empty>
			{:else}
				<PositionsSummary rows={totalRows} />
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
