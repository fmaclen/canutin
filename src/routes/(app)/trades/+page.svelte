<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { getSecurityTransactionsContext } from '$lib/security-transactions.svelte';

	import SecurityTransactionFilters from './security-transaction-filters.svelte';
	import SecurityTransactionTable from './security-transaction-table.svelte';

	const securityTxContext = getSecurityTransactionsContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	let hasSyncedAccountFilters = $state(false);
	let hasSyncedSecurityFilters = $state(false);

	afterNavigate(({ to }) => {
		if (to?.url.pathname !== resolve('/trades')) return;
		securityTxContext.syncFromUrl();
	});

	$effect(() => {
		if (hasSyncedAccountFilters || accountsContext.accounts.length === 0) return;
		hasSyncedAccountFilters = true;
		securityTxContext.syncFromUrl();
	});

	$effect(() => {
		if (hasSyncedSecurityFilters || securitiesContext.securities.length === 0) return;
		hasSyncedSecurityFilters = true;
		securityTxContext.syncFromUrl();
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.trades_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="flex items-center gap-4 px-4">
		<Link href={resolve('/trades/securities')} class="text-sm">{m.securities_title()}</Link>
		<Separator orientation="vertical" class="data-[orientation=vertical]:h-4" />
		<Link href={resolve('/trades/add')} class="text-sm">
			{m.trades_add_link()}
		</Link>
	</nav>
</header>

<Page pageTitle={m.trades_title()}>
	<Section>
		<SectionTitle title={m.trades_title()} />
		<div class="flex flex-col space-y-2">
			<SecurityTransactionFilters />
			{#if securityTxContext.isLoading && securityTxContext.rawTransactions.length === 0}
				<Skeleton class="min-h-32" />
			{:else}
				<SecurityTransactionTable />
			{/if}
		</div>
	</Section>
</Page>
