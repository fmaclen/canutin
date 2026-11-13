<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { Snippet } from 'svelte';

	import { beforeNavigate } from '$app/navigation';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';

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
	let actionsOpen = $state(false);

	// Actions that stay within the same layout (a security's trades link) keep this Page mounted.
	beforeNavigate(() => (actionsOpen = false));
</script>

<svelte:head>
	<title>{getPageTitle(pageTitle, crumbs)}</title>
</svelte:head>

<!-- Safari 26 draws the page behind a translucent status bar and only paints that strip solid
     when a full-width fixed or sticky element touches the top edge. The icon rail covers the left
     end of the top edge, so the bar below never spans the full width; this strip does. Safari
     takes the color from the middle of the edge, the bar's, while over the rail the strip paints
     the rail's own color and leaves its edge line showing, so it stays invisible. It stays
     shorter than the rail's logo so it only overlaps empty space. -->
<div
	aria-hidden="true"
	class="pointer-events-none fixed inset-x-0 top-0 z-20 h-1.5 md:hidden"
	style="--rail: calc(var(--sidebar-width-icon) + env(safe-area-inset-left)); background: linear-gradient(to right, var(--sidebar) calc(var(--rail) - 1px), transparent 0 var(--rail), var(--muted) 0);"
></div>

<!-- On phones the row is fixed beside the icon rail rather than sticky: iOS drags sticky elements
     along with the content when the page is pulled past its end, so a sticky bar slides away.
     The spacer below holds its place in the flow. In a Home Screen install, where the status bar
     area belongs to the page, the safe-area padding keeps the row's contents clear of it.
     The stacking is dropped at `md`: a flex item's z-index applies even while it's static, so
     `z-10` would tie with the fixed sidebar's own `z-10` and win on DOM order, painting over the
     sidebar wherever the two overlap - which is anywhere the page scrolls horizontally. -->
<div
	aria-hidden="true"
	class="h-[calc(--spacing(12)+env(safe-area-inset-top))] shrink-0 md:hidden"
></div>
<div
	class="bg-muted fixed top-0 right-0 left-[calc(var(--sidebar-width-icon)+env(safe-area-inset-left))] z-10 pt-[env(safe-area-inset-top)] md:static md:z-auto"
>
	<div class="flex h-12 items-center gap-2 px-4 max-md:border-b">
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
							<!-- Phones drop the big title header, so the last crumb stands in as the title -->
							<Breadcrumb.Page title={crumb.label} class="max-md:font-semibold"
								>{crumb.label}</Breadcrumb.Page
							>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
		{#if actions}
			<!-- Phones collect the header actions behind one button instead of squeezing them beside
			     the title. The menu renders in place rather than in a portal so it stays inside
			     <main> alongside the desktop actions. -->
			<Popover.Root bind:open={actionsOpen}>
				<Popover.Trigger
					aria-label={m.ui_page_actions()}
					class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'ml-auto size-8 md:hidden')}
				>
					<EllipsisIcon />
				</Popover.Trigger>
				<Popover.Content align="end" portalProps={{ disabled: true }} class="w-auto min-w-48 p-1">
					<nav
						class="[&>a]:hover:bg-accent flex flex-col text-sm [&>a]:rounded-sm [&>a]:px-3 [&>a]:py-2.5 [&>a]:no-underline"
					>
						{@render actions()}
					</nav>
				</Popover.Content>
			</Popover.Root>
		{/if}
	</div>
</div>

<!-- On phones the bar above carries the dividing line, so the header only draws its own under
     the sub-navigation tabs -->
<header class={cn('bg-muted border-b', !subNav && 'max-md:border-b-0')}>
	<div class="flex items-end justify-between gap-4 md:px-8 md:pt-16 md:pb-6">
		<h1 class="text-foreground text-2xl font-bold tracking-tight max-md:sr-only">{pageTitle}</h1>
		{#if actions && !subNav}
			<nav class="flex items-center gap-4 max-md:hidden">
				{@render actions()}
			</nav>
		{/if}
	</div>

	{#if subNav}
		<div class="flex items-end justify-between gap-4 px-4 max-md:pt-3.25 sm:px-8">
			{@render subNav()}
			{#if actions}
				<nav class="mb-0.5 flex items-center gap-4 pb-4 max-md:hidden">
					{@render actions()}
				</nav>
			{/if}
		</div>
	{/if}
</header>
<!-- The padding above and below matches the gap between sections, so the first section title
     sits as far below the bar as every other title sits below the section before it -->
<div data-slot="page-content" class="flex flex-1 flex-col space-y-6 px-4 py-6 sm:space-y-8 sm:p-8">
	{@render children?.()}
</div>
