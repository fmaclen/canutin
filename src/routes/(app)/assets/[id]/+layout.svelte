<script lang="ts">
	import { error } from '@sveltejs/kit';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Page from '$lib/components/page.svelte';
	import SubNav from '$lib/components/sub-nav.svelte';
	import { m } from '$lib/paraglide/messages';

	const assetsContext = getAssetsContext();

	const assetId = $derived(page.params.id);
	const asset = $derived(assetId ? assetsContext.getAsset(assetId) : null);
	const isLoading = $derived(assetsContext.isLoading);

	$effect(() => {
		if (asset) return;
		if (!isLoading && assetId) {
			error(404, m.assets_edit_error_not_found());
		}
	});

	// NOTE: carry a ?from= redirect target across the sub-nav so saving on Edit still returns the
	// user to wherever they opened the asset from (e.g. the assets table).
	const fromParam = $derived(page.url.searchParams.get('from'));
	const fromQuery = $derived(fromParam ? `?from=${encodeURIComponent(fromParam)}` : '');
	const isEdit = $derived(page.url.pathname.endsWith('/edit'));

	const subNavItems = $derived([
		{
			label: m.nav_overview(),
			href: resolve(`/assets/${assetId}${fromQuery}`),
			active: !isEdit
		},
		{
			label: m.nav_edit(),
			href: resolve(`/assets/${assetId}/edit${fromQuery}`),
			active: isEdit
		}
	]);

	const crumbs = $derived([
		{ label: m.sidebar_assets(), href: resolve('/assets') },
		...(isEdit
			? [
					{ label: asset?.name ?? '', href: resolve(`/assets/${assetId}${fromQuery}`) },
					{ label: m.nav_edit() }
				]
			: [{ label: asset?.name ?? '' }])
	]);

	let { children } = $props();
</script>

{#snippet subNav()}
	<SubNav items={subNavItems} />
{/snippet}

<Page pageTitle={asset?.name ?? ''} {crumbs} {subNav}>
	{@render children?.()}
</Page>
