<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Page from '$lib/components/page.svelte';
	import SubNav from '$lib/components/sub-nav.svelte';
	import { m } from '$lib/paraglide/messages';

	const isImports = $derived(page.url.pathname.endsWith('/imports'));

	const subNavItems = $derived([
		{ label: m.nav_general(), href: resolve('/settings'), active: !isImports },
		{
			label: m.settings_imports_section_title(),
			href: resolve('/settings/imports'),
			active: isImports
		}
	]);

	const crumbs = $derived(
		isImports
			? [
					{ label: m.settings_page_title(), href: resolve('/settings') },
					{ label: m.settings_imports_section_title() }
				]
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
