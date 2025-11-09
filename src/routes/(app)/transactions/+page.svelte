<script lang="ts">
	import Page from '$lib/components/page.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setTransactionsContext } from '$lib/transactions.svelte';

	import TransactionFilters from './transaction-filters.svelte';
	import TransactionTable from './transaction-table.svelte';

	const pb = getPocketBaseContext();
	const txContext = setTransactionsContext(pb);

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

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
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
</header>

<Page pageTitle={m.sidebar_transactions()}>
	<Section>
		{#if txContext.isLoading && txContext.rawTransactions.length === 0}
			<Skeleton class="h-64" />
		{:else}
			<div class="flex flex-col gap-4">
				<TransactionFilters />
				<TransactionTable />
			</div>
		{/if}
	</Section>
</Page>
