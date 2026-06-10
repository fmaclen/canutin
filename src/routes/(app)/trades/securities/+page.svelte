<script lang="ts">
	import { resolve } from '$app/paths';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	const securitiesContext = getSecuritiesContext();
	const rows = $derived(
		securitiesContext.securities.toSorted((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		)
	);
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/trades')}>{m.trades_title()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_securities()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="flex items-center gap-4 px-4">
		<Link href={resolve('/trades/securities/add')} class="text-sm">{m.securities_button_add()}</Link
		>
	</nav>
</header>

<Page pageTitle={m.sidebar_securities()}>
	<Section>
		<SectionTitle title={m.sidebar_securities()} />
		{#if securitiesContext.isLoading}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64" />
			</div>
		{:else if rows.length === 0}
			<Empty>{m.securities_empty()}</Empty>
		{:else}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_security()}
							</Table.Head>
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_symbol()}
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rows as row (row.id)}
							<Table.Row>
								<Table.Cell>
									<Link
										href={resolve(`/trades/securities/${row.id}`)}
										class="text-foreground/90 text-sm font-medium"
									>
										{row.name}
									</Link>
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-sm tracking-wide uppercase">
									{#if row.symbol}
										{row.symbol}
									{:else}
										<span class="text-muted-foreground">~</span>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</Section>
</Page>
