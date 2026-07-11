<script lang="ts">
	import { slide } from 'svelte/transition';

	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	import TransactionFilters from './transaction-filters.svelte';
	import TransactionSummary from './transaction-summary.svelte';
	import TransactionTable from './transaction-table.svelte';

	const txContext = getTransactionsContext();
	let hasNavigated = $state(false);

	afterNavigate(({ to }) => {
		if (to?.url.pathname !== resolve('/transactions')) return;
		if (!hasNavigated) {
			hasNavigated = true;
			if (to.url.pathname + to.url.search !== txContext.currentListPath) {
				txContext.syncFromUrl();
			}
			return;
		}
		txContext.syncFromUrl();
	});

	$effect(() => {
		if (txContext.page > txContext.totalPages) txContext.setPage(txContext.totalPages);
		if (txContext.page < 1) txContext.setPage(1);
	});

	$effect(() => {
		void txContext.period;
		void txContext.kind;
		void txContext.accountFilter;
		void txContext.labelFilters;
		txContext.page = 1;
	});
</script>

<Page pageTitle={m.sidebar_transactions()}>
	{#snippet actions()}
		<Link href={resolve('/transactions/add')} class="text-sm">{m.transactions_add_link()}</Link>
	{/snippet}
	<Section>
		<SectionTitle title={m.transactions_section_title()} />
		<div class="flex flex-col space-y-2">
			<TransactionFilters />
			<TransactionSummary />
			{#if txContext.selectedCount > 0}
				<div
					class="bg-brand-secondary border-border flex h-12 items-center justify-between rounded-sm border pr-2 pl-4"
					transition:slide={{ duration: 150 }}
				>
					<span class="text-sm font-semibold tracking-tight">
						{m.transactions_batch_page_title()}
					</span>
					<div class="flex gap-2">
						{#if txContext.totalPages > 1 && !txContext.isAllFilteredSelected}
							<Button variant="outline" size="sm" onclick={() => txContext.selectAllFiltered()}>
								{m.transactions_batch_select_all_results({ count: txContext.filteredCount })}
							</Button>
						{/if}
						<Button href={resolve('/transactions/batch')} size="sm">
							{txContext.selectedCount === 1
								? m.transactions_batch_edit_button_one()
								: m.transactions_batch_edit_button_other({ count: txContext.selectedCount })}
						</Button>
					</div>
				</div>
			{/if}
			{#if txContext.isLoading && txContext.rawTransactions.length === 0}
				<Skeleton class="h-64" showSpinner />
			{:else}
				<TransactionTable />
			{/if}
		</div>
	</Section>
</Page>
