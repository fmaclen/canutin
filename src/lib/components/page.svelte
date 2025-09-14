<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getPageTitle } from './page';

	let { pageTitle, children }: { pageTitle: string; children: Snippet } = $props();
</script>

<svelte:head>
	<title>{getPageTitle(pageTitle)}</title>
</svelte:head>

<div class="flex flex-col space-y-8 p-8">
	{@render children?.()}
</div>
