<script lang="ts">
	import { onDestroy } from 'svelte';

	import { page } from '$app/state';
	import { setAccountCashflowContext } from '$lib/account-cashflow.svelte';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const ctx = setAccountCashflowContext(pb);
	const accountsContext = getAccountsContext();

	onDestroy(() => {
		ctx.dispose();
	});

	const accountId = $derived(page.params.id);
	const account = $derived(accountId ? accountsContext.getAccount(accountId) : null);

	// NOTE: Only set the account once it is loaded so the store resolves the
	// correct perspective on its first compute. Feeding the current id reactively
	// also drives a refetch when navigating between two account detail pages.
	$effect(() => {
		if (account) ctx.setAccount(account.id, account.perspective);
	});

	let { children } = $props();
</script>

{@render children?.()}
