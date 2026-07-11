<script lang="ts">
	import { error } from '@sveltejs/kit';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SubNav from '$lib/components/sub-nav.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	const securitiesContext = getSecuritiesContext();

	const securityId = $derived(page.params.id);
	const security = $derived(securityId ? securitiesContext.getSecurity(securityId) : null);

	$effect(() => {
		if (security) return;
		if (!securitiesContext.isLoading && securityId) {
			error(404, m.securities_error_not_found());
		}
	});

	const isEdit = $derived(page.url.pathname.endsWith('/edit'));

	const subNavItems = $derived([
		{
			label: m.nav_overview(),
			href: resolve(`/securities/${securityId}`),
			active: !isEdit
		},
		{
			label: m.nav_edit(),
			href: resolve(`/securities/${securityId}/edit`),
			active: isEdit
		}
	]);

	const crumbs = $derived([
		{ label: m.securities_title(), href: resolve('/securities') },
		...(isEdit
			? [
					{ label: security?.name ?? '', href: resolve(`/securities/${securityId}`) },
					{ label: m.nav_edit() }
				]
			: [{ label: security?.name ?? '' }])
	]);

	let { children } = $props();
</script>

{#snippet actions()}
	{#if security}
		<Link href={`${resolve('/trades')}?security=${security.id}`} class="text-sm">
			{m.trades_title()}
		</Link>
	{/if}
{/snippet}

{#snippet subNav()}
	<SubNav items={subNavItems} />
{/snippet}

<Page pageTitle={security?.name ?? ''} {crumbs} {actions} {subNav}>
	{@render children?.()}
</Page>
