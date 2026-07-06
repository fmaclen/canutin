<script lang="ts">
	import type { Snippet } from 'svelte';

	import { getPageTitle, type Crumb } from './page';
	import PageHeader from './page-header.svelte';

	let {
		pageTitle,
		actions,
		crumbs,
		subNav,
		children
	}: {
		pageTitle: string;
		actions?: Snippet;
		crumbs?: Crumb[];
		subNav?: Snippet;
		children: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{getPageTitle(pageTitle, crumbs)}</title>
</svelte:head>

<PageHeader title={pageTitle} {actions} {crumbs} {subNav} />
<div class="flex flex-col space-y-8 p-6 sm:p-8">
	{@render children?.()}
</div>
