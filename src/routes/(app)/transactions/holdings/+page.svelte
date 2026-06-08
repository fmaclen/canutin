<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { afterNavigate, goto } from '$app/navigation';
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
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { setSecurityTransactionsContext } from '$lib/security-transactions.svelte';

	import AddAccountToastLink from '../add-account-toast-link.svelte';
	import SecurityTransactionFilters from '../security-transaction-filters.svelte';
	import SecurityTransactionTable from '../security-transaction-table.svelte';

	const pb = getPocketBaseContext();
	const securityTxContext = setSecurityTransactionsContext(pb);
	const accountsContext = getAccountsContext();
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed && a.canWrite));
	let hasSyncedAccountFilters = $state(false);

	function handleAddTransactionClick(event: MouseEvent) {
		if (accountsContext.isLoading || openAccounts.length > 0) return;

		event.preventDefault();
		toast.warning(m.transactions_add_account_required_title(), {
			description: m.transactions_add_account_required_description(),
			action: AddAccountToastLink
		});
	}

	async function handleViewChange(value: string | undefined) {
		if (value !== 'cash') return;

		await goto(resolve('/transactions'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	afterNavigate(({ to }) => {
		if (to?.url.pathname !== resolve('/transactions/holdings')) return;
		securityTxContext.syncFromUrl();
	});

	$effect(() => {
		if (hasSyncedAccountFilters || accountsContext.accounts.length === 0) return;
		hasSyncedAccountFilters = true;
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
					<Breadcrumb.Link href="/transactions">{m.sidebar_transactions()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.transactions_view_securities()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="px-4">
		<Link
			href={`${resolve('/transactions/add')}?mode=holdings`}
			class="text-sm"
			onclick={handleAddTransactionClick}>{m.transactions_add_link()}</Link
		>
	</nav>
</header>

<Page pageTitle={m.sidebar_transactions()}>
	<Section>
		<Tabs.Root value="holdings" onValueChange={handleViewChange}>
			<nav class="flex items-center justify-between space-x-2">
				<SectionTitle title={m.transactions_section_title()} />
				<Tabs.List>
					<Tabs.Trigger value="cash">{m.transactions_view_cash()}</Tabs.Trigger>
					<Tabs.Trigger value="holdings">{m.transactions_view_securities()}</Tabs.Trigger>
				</Tabs.List>
			</nav>

			<Tabs.Content value="holdings">
				<div class="flex flex-col space-y-2">
					<SecurityTransactionFilters />
					{#if securityTxContext.isLoading && securityTxContext.rawTransactions.length === 0}
						<Skeleton class="min-h-32" />
					{:else}
						<SecurityTransactionTable />
					{/if}
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Section>
</Page>
