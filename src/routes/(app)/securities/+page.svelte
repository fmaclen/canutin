<script lang="ts">
	import { resolve } from '$app/paths';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import type { SecuritiesResponse } from '$lib/pocketbase.schema';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, type SortState } from '$lib/utils';

	const securitiesContext = getSecuritiesContext();

	type SecuritiesSortColumn = 'name' | 'symbol';
	const validSortColumns: SecuritiesSortColumn[] = ['name', 'symbol'];

	const defaultSort: SortState<SecuritiesSortColumn> = { column: 'name', direction: 'asc' };
	const sort = new TableSort<SecuritiesSortColumn>(validSortColumns, defaultSort);

	const sortedRows = $derived.by(() => {
		const comparator = createSortComparator<SecuritiesResponse, SecuritiesSortColumn>(sort.state, {
			name: (r) => r.name,
			symbol: (r) => r.symbol ?? null
		});
		return [...securitiesContext.securities].sort(comparator);
	});
</script>

{#snippet actions()}
	<Link href={resolve('/securities/add')} class="text-sm">{m.securities_add_page_title()}</Link>
{/snippet}

<Page pageTitle={m.securities_title()} {actions}>
	<Section>
		<SectionTitle title={m.securities_title()} />
		{#if securitiesContext.isLoading}
			<Skeleton class="h-64" showSpinner />
		{:else if securitiesContext.securities.length === 0}
			<Empty>{m.securities_empty()}</Empty>
		{:else}
			<div class="full-bleed bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="name"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_security()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="symbol"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
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
										href={resolve(`/securities/${row.id}`)}
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
