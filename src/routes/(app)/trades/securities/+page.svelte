<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
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
	import type { SecuritiesResponse } from '$lib/pocketbase.schema';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import {
		createSortComparator,
		getSortFromUrl,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	const securitiesContext = getSecuritiesContext();

	type SecuritiesSortColumn = 'name' | 'symbol';
	const validSortColumns: SecuritiesSortColumn[] = ['name', 'symbol'];

	const defaultSort: SortState<SecuritiesSortColumn> = { column: 'name', direction: 'asc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl(page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as SecuritiesSortColumn)
		) {
			return urlSort as SortState<SecuritiesSortColumn>;
		}
		return defaultSort;
	});

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as SecuritiesSortColumn);
		const newUrl = setSortInUrl(page.url, newState);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	const sortedRows = $derived.by(() => {
		const comparator = createSortComparator<SecuritiesResponse, SecuritiesSortColumn>(sortState, {
			name: (r) => r.name,
			symbol: (r) => r.symbol ?? null
		});
		return [...securitiesContext.securities].sort(comparator);
	});
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
					<Breadcrumb.Page>{m.securities_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="flex items-center gap-4 px-4">
		<Link href={resolve('/trades/securities/add')} class="text-sm">{m.securities_button_add()}</Link
		>
	</nav>
</header>

<Page pageTitle={m.securities_title()}>
	<Section>
		<SectionTitle title={m.securities_title()} />
		{#if securitiesContext.isLoading}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64" showSpinner />
			</div>
		{:else if securitiesContext.securities.length === 0}
			<Empty>{m.securities_empty()}</Empty>
		{:else}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="name"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_security()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="symbol"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_symbol()}
							</Table.SortableHead>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each sortedRows as row (row.id)}
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
