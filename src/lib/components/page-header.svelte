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

	const trail = $derived(crumbs?.length ? crumbs : [{ label: title }]);
</script>

<header class="bg-muted border-b">
	<div class="flex h-12 items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each trail as crumb, index (index)}
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
	</div>

	<div class="flex items-end justify-between gap-4 px-6 pt-16 pb-6 sm:px-8">
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
