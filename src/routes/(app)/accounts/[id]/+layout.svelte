<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { onDestroy } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { setAccountCashflowContext } from '$lib/account-cashflow.svelte';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import Page from '$lib/components/page.svelte';
	import SubNav from '$lib/components/sub-nav.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const ctx = setAccountCashflowContext(pb);
	const accountsContext = getAccountsContext();

	onDestroy(() => {
		ctx.dispose();
	});

	const accountId = $derived(page.params.id);
	const account = $derived(accountId ? accountsContext.getAccount(accountId) : null);
	const isLoading = $derived(accountsContext.isLoading);

	// NOTE: Only set the account once it is loaded so the store resolves the
	// correct perspective on its first compute. Feeding the current id reactively
	// also drives a refetch when navigating between two account detail pages.
	$effect(() => {
		if (account) {
			ctx.setAccount(account.id, account.perspective, account.currency);
			return;
		}
		if (!isLoading && accountId) {
			error(404, m.accounts_edit_error_not_found());
		}
	});

	// NOTE: carry a ?from= redirect target across the sub-nav so saving on Edit still returns the
	// user to wherever they opened the account from (e.g. the accounts table).
	const fromParam = $derived(page.url.searchParams.get('from'));
	const fromQuery = $derived(fromParam ? `?from=${encodeURIComponent(fromParam)}` : '');
	const isEdit = $derived(page.url.pathname.endsWith('/edit'));

	const subNavItems = $derived([
		{
			label: m.nav_overview(),
			href: resolve(`/accounts/${accountId}${fromQuery}`),
			active: !isEdit
		},
		{
			label: m.nav_edit(),
			href: resolve(`/accounts/${accountId}/edit${fromQuery}`),
			active: isEdit
		}
	]);

	const crumbs = $derived([
		{ label: m.sidebar_accounts(), href: resolve('/accounts') },
		...(isEdit
			? [
					{ label: account?.name ?? '', href: resolve(`/accounts/${accountId}${fromQuery}`) },
					{ label: m.nav_edit() }
				]
			: [{ label: account?.name ?? '' }])
	]);

	let { children } = $props();
</script>

{#snippet subNav()}
	<SubNav items={subNavItems} />
{/snippet}

<Page pageTitle={account?.name ?? ''} {crumbs} {subNav}>
	{@render children?.()}
</Page>
