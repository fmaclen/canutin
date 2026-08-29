<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { getTradesContext } from '$lib/trades.svelte';

	import TradeSummary from './trade-summary.svelte';
	import TradesFilters from './trades-filters.svelte';
	import TradesTable from './trades-table.svelte';

	const tradesContext = getTradesContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	let hasSyncedAccountFilters = $state(false);
	let hasSyncedSecurityFilters = $state(false);

	afterNavigate(({ to }) => {
		if (to?.url.pathname !== resolve('/trades')) return;
		tradesContext.syncFromUrl();
	});

	$effect(() => {
		if (hasSyncedAccountFilters || accountsContext.accounts.length === 0) return;
		hasSyncedAccountFilters = true;
		tradesContext.syncFromUrl();
	});

	$effect(() => {
		if (hasSyncedSecurityFilters || securitiesContext.securities.length === 0) return;
		hasSyncedSecurityFilters = true;
		tradesContext.syncFromUrl();
	});

	$effect(() => {
		if (tradesContext.page > tradesContext.totalPages) {
			tradesContext.setPage(tradesContext.totalPages);
		}
		if (tradesContext.page < 1) tradesContext.setPage(1);
	});

	$effect(() => {
		void tradesContext.period;
		void tradesContext.accountFilter;
		void tradesContext.securityFilter;
		void tradesContext.typeFilter;
		tradesContext.page = 1;
	});
</script>

{#snippet actions()}
	<Link href={resolve('/trades/add')} class="text-sm">{m.trades_add_link()}</Link>
{/snippet}

<Page pageTitle={m.trades_title()} {actions}>
	<Section>
		<SectionTitle title={m.trades_section_title()} />
		<div class="flex flex-col space-y-2">
			<TradesFilters />
			<TradeSummary />
			{#if tradesContext.isLoading && tradesContext.rawTransactions.length === 0}
				<Skeleton class="h-64" showSpinner />
			{:else}
				<TradesTable />
			{/if}
		</div>
	</Section>
</Page>
