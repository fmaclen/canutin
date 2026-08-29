<script lang="ts">
	import type { Snippet } from 'svelte';

	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	import { getPageTitle, type Crumb } from './page';

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

	const trail = $derived(crumbs?.length ? crumbs : [{ label: pageTitle }]);
</script>

<svelte:head>
	<title>{getPageTitle(pageTitle, crumbs)}</title>
</svelte:head>

<!-- iOS Safari tints the strip behind the status bar with the background of a sticky or fixed
     element near the viewport edge, so this row has to stay pinned there on mobile or the strip
     falls back to the body's color. It sits outside <header> because a sticky element can't
     travel past its own parent's box, and the header ends well before the page does.
     The stacking is dropped at `md`: a flex item's z-index applies even while it's static, so
     `z-10` would tie with the fixed sidebar's own `z-10` and win on DOM order, painting over the
     sidebar wherever the two overlap - which is anywhere the page scrolls horizontally. -->
<div class="bg-muted sticky top-0 z-10 md:static md:z-auto">
	<div class="flex h-12 items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root class="min-w-0 overflow-hidden">
			<!-- The trail has to stay on a single line: wrapping pushes the first crumb under the phone's
			     status bar. The section and the current page are never allowed to shrink, so any overflow
			     is absorbed by the crumbs in between - in practice the entity name, which is the only
			     segment of arbitrary length. -->
			<Breadcrumb.List class="flex-nowrap">
				{#each trail as crumb, index (index)}
					{#if index > 0}
						<Breadcrumb.Separator class="shrink-0" />
					{/if}
					<Breadcrumb.Item
						class={index === 0 || index === trail.length - 1 ? 'shrink-0' : 'min-w-0'}
					>
						{#if crumb.href}
							<Breadcrumb.Link href={crumb.href} title={crumb.label} class="truncate"
								>{crumb.label}</Breadcrumb.Link
							>
						{:else}
							<Breadcrumb.Page title={crumb.label}>{crumb.label}</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</div>

<header class="bg-muted border-b">
	<div class="flex items-end justify-between gap-4 px-6 pt-16 pb-6 sm:px-8">
		<h1 class="text-foreground text-2xl font-bold tracking-tight">{pageTitle}</h1>
		{#if actions && !subNav}
			<nav class="flex items-center gap-4">
				{@render actions()}
			</nav>
		{/if}
	</div>

	{#if subNav}
		<div class="flex items-end justify-between gap-4 px-6 sm:px-8">
			{@render subNav()}
			{#if actions}
				<nav class="mb-0.5 flex items-center gap-4 pb-4">
					{@render actions()}
				</nav>
			{/if}
		</div>
	{/if}
</header>
<div class="flex flex-col space-y-8 p-6 sm:p-8">
	{@render children?.()}
</div>
