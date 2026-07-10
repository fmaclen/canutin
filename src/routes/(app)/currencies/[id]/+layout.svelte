<script lang="ts">
	import { error } from '@sveltejs/kit';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Page from '$lib/components/page.svelte';
	import SubNav from '$lib/components/sub-nav.svelte';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { m } from '$lib/paraglide/messages';

	const currenciesContext = getCurrenciesContext();

	const recordId = $derived(page.params.id);
	const currency = $derived(
		recordId ? currenciesContext.currencies.find((row) => row.id === recordId) : undefined
	);
	const isUsd = $derived(currency?.code === 'USD');

	$effect(() => {
		if (currency) return;
		if (currenciesContext.isLoaded && recordId) error(404, m.currencies_edit_error_not_found());
	});

	// NOTE: carry a ?from= redirect target across the sub-nav so saving on Edit still returns the
	// user to wherever they opened the currency from (e.g. the currencies ledger).
	const fromParam = $derived(page.url.searchParams.get('from'));
	const fromQuery = $derived(fromParam ? `?from=${encodeURIComponent(fromParam)}` : '');
	const isEdit = $derived(page.url.pathname.endsWith('/edit'));

	// NOTE: USD has no quote entry/history, so its Overview has nothing read-only to show - send
	// it straight to Edit instead of rendering a pointless empty tab.
	$effect(() => {
		if (currenciesContext.isLoaded && currency && isUsd && !isEdit) {
			goto(resolve(`/currencies/${recordId}/edit${fromQuery}`), { replaceState: true });
		}
	});

	const subNavItems = $derived([
		{
			label: m.nav_overview(),
			href: resolve(`/currencies/${recordId}${fromQuery}`),
			active: !isEdit
		},
		{
			label: m.nav_edit(),
			href: resolve(`/currencies/${recordId}/edit${fromQuery}`),
			active: isEdit
		}
	]);

	// NOTE: USD has no Overview tab, so its edit view is a single record view - the code is the
	// leaf. Other currencies show the Edit tab as the leaf under a linked code crumb.
	const crumbs = $derived([
		{ label: m.sidebar_currencies(), href: resolve('/currencies') },
		...(isEdit && !isUsd
			? [
					{ label: currency?.code ?? '', href: resolve(`/currencies/${recordId}${fromQuery}`) },
					{ label: m.nav_edit() }
				]
			: [{ label: currency?.code ?? '' }])
	]);

	let { children } = $props();
</script>

{#snippet subNav()}
	<SubNav items={subNavItems} />
{/snippet}

<Page pageTitle={currency?.code ?? ''} {crumbs} subNav={isUsd ? undefined : subNav}>
	{@render children?.()}
</Page>
