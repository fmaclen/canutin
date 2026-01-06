<script lang="ts">
	import { slide } from 'svelte/transition';

	import { afterNavigate } from '$app/navigation';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	import TransactionFilters from './transaction-filters.svelte';
	import TransactionSummary from './transaction-summary.svelte';
	import TransactionTable from './transaction-table.svelte';

	const txContext = getTransactionsContext();

	// Sync filters from URL after navigation (e.g., clicking sidebar link)
	afterNavigate(() => {
		txContext.syncFromUrl();
	});

	// Keep page within valid bounds
	$effect(() => {
		if (txContext.page > txContext.totalPages) txContext.page = txContext.totalPages;
		if (txContext.page < 1) txContext.page = 1;
	});

	// Reset pagination whenever the active filters change
	$effect(() => {
		void txContext.period;
		void txContext.kind;
		txContext.page = 1;
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_transactions()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="px-2">
		<Link href="/transactions/add" class="text-sm">{m.transactions_add_link()}</Link>
	</nav>
</header>

<Page pageTitle={m.sidebar_transactions()}>
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
					<Button href="/transactions/batch" size="sm">
						{txContext.selectedCount === 1
							? m.transactions_batch_edit_button_one()
							: m.transactions_batch_edit_button_other({ count: txContext.selectedCount })}
					</Button>
				</div>
			{/if}
			{#if txContext.isLoading && txContext.rawTransactions.length === 0}
				<Skeleton class="min-h-32" />
			{:else}
				<TransactionTable />
			{/if}
		</div>
	</Section>
</Page>
