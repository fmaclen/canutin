<script lang="ts">
	import type { Snippet } from 'svelte';

	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	import type { Crumb } from './page';

	let {
		title,
		actions,
		crumbs,
		subNav
	}: {
		title: string;
		actions?: Snippet;
		crumbs?: Crumb[];
		subNav?: Snippet;
	} = $props();
</script>

<header class="bg-background border-b">
	<div class="flex h-12 items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		{#if crumbs && crumbs.length}
			<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
			<Breadcrumb.Root>
				<Breadcrumb.List>
					{#each crumbs as crumb, index (crumb.label)}
						{#if index > 0}
							<Breadcrumb.Separator />
						{/if}
						<Breadcrumb.Item>
							{#if crumb.href}
								<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
							{:else}
								<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
							{/if}
						</Breadcrumb.Item>
					{/each}
				</Breadcrumb.List>
			</Breadcrumb.Root>
		{/if}
	</div>

	<div class="flex items-end justify-between gap-4 px-6 pt-16 pb-5 sm:px-8">
		<h1 class="text-foreground text-2xl font-bold tracking-tight">{title}</h1>
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
