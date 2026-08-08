<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Page from '$lib/components/page.svelte';
	import SubNav from '$lib/components/sub-nav.svelte';
	import { m } from '$lib/paraglide/messages';

	const isImports = $derived(page.url.pathname.endsWith('/imports'));
	const isConnections = $derived(page.url.pathname.endsWith('/connections'));

	const subNavItems = $derived([
		{ label: m.nav_general(), href: resolve('/settings'), active: !isImports && !isConnections },
		{
			label: m.settings_imports_section_title(),
			href: resolve('/settings/imports'),
			active: isImports
		},
		{
			label: m.settings_connections_section_title(),
			href: resolve('/settings/connections'),
			active: isConnections
		}
	]);

	const subPageTitle = $derived(
		isImports
			? m.settings_imports_section_title()
			: isConnections
				? m.settings_connections_section_title()
				: null
	);

	const crumbs = $derived(
		subPageTitle
			? [{ label: m.settings_page_title(), href: resolve('/settings') }, { label: subPageTitle }]
			: undefined
	);

	let { children } = $props();
</script>

{#snippet subNav()}
	<SubNav items={subNavItems} />
{/snippet}

<Page pageTitle={m.settings_page_title()} {crumbs} {subNav}>
	{@render children?.()}
</Page>
