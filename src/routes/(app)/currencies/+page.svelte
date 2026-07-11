<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { formatNativeCurrency } from '$lib/components/currency';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import Number from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Pagination from '$lib/components/ui/pagination/index';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ExchangeRatesResponse } from '$lib/pocketbase.schema';
	import {
		createSortComparator,
		getSortFromUrl,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	const currenciesContext = getCurrenciesContext();
	const exchangeRatesContext = getExchangeRatesContext();

	type CurrencyRow = {
		id: string;
		code: string;
		name: string;
		autoUpdate: boolean;
		latestDate: string | null;
		latestRate: number | null;
		isUsd: boolean;
	};

	type CurrencySortColumn = 'code' | 'name' | 'autoUpdate' | 'lastUpdated' | 'latestQuote';
	const validSortColumns: CurrencySortColumn[] = [
		'code',
		'name',
		'autoUpdate',
		'lastUpdated',
		'latestQuote'
	];

	const defaultSort: SortState<CurrencySortColumn> = { column: 'code', direction: 'asc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl(page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as CurrencySortColumn)
		) {
			return urlSort as SortState<CurrencySortColumn>;
		}
		return defaultSort;
	});

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as CurrencySortColumn);
		const newUrl = setSortInUrl(page.url, newState);
		currentPage = 1;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	function latestQuoteFor(code: string) {
		let latest: ExchangeRatesResponse | null = null;
		for (const record of exchangeRatesContext.records) {
			if (record.currency !== code) continue;
			if (!latest || new Date(record.date).getTime() > new Date(latest.date).getTime()) {
				latest = record;
			}
		}
		return latest;
	}

	function autoUpdateLabel(row: CurrencyRow) {
		return row.autoUpdate
			? m.currencies_auto_update_automatic()
			: m.currencies_auto_update_manual();
	}

	const sortedRows = $derived.by(() => {
		const rows: CurrencyRow[] = currenciesContext.currencies.map((currency) => {
			const isUsd = currency.code === 'USD';
			const latest = isUsd ? null : latestQuoteFor(currency.code);
			return {
				id: currency.id,
				code: currency.code,
				name: isUsd ? currency.name || m.currencies_usd_name() : currency.name,
				autoUpdate: currency.autoUpdate,
				latestDate: latest?.date ?? null,
				latestRate: isUsd ? 1 : (latest?.rate ?? null),
				isUsd
			};
		});

		const comparator = createSortComparator<CurrencyRow, CurrencySortColumn>(sortState, {
			code: (r) => r.code,
			name: (r) => r.name || null,
			autoUpdate: (r) => (r.isUsd ? null : autoUpdateLabel(r)),
			lastUpdated: (r) => (r.isUsd ? null : r.latestDate),
			latestQuote: (r) => r.latestRate
		});
		return rows.sort(comparator);
	});

	const pageSize = 50;
	let currentPage = $state(1);

	const totalItems = $derived(sortedRows.length);
	const totalPages = $derived(totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize));
	const paginatedRows = $derived(
		sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	);

	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
		if (currentPage < 1) currentPage = 1;
	});

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(getFormattingLocale(), {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<Page pageTitle={m.currencies_section_title()}>
	{#snippet actions()}
		<Link href={resolve('/currencies/add')} class="text-sm">{m.currencies_add_page_title()}</Link>
	{/snippet}
	<Section>
		{#if !currenciesContext.isLoaded || !exchangeRatesContext.isLoaded}
			<Skeleton class="h-64" showSpinner />
		{:else}
			<SectionTitle title={m.currencies_section_title()} />
			{#if sortedRows.length === 0}
				<Empty>
					{m.currencies_empty()}
				</Empty>
			{:else}
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="code"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_code()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="name"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_name()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="autoUpdate"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_auto_update()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="lastUpdated"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_last_updated()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="latestQuote"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_latest_quote()}
								</Table.SortableHead>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each paginatedRows as row (row.id)}
								<Table.Row>
									<Table.Cell>
										<Link
											href={`${resolve(`/currencies/${row.id}`)}?from=${encodeURIComponent(
												page.url.pathname + page.url.search
											)}`}
											class="text-foreground/90 text-sm font-medium">{row.code}</Link
										>
									</Table.Cell>
									<Table.Cell class="text-foreground/80 text-sm">
										{#if row.name}
											{row.name}
										{:else}
											<span class="text-muted-foreground">~</span>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-foreground/80 text-sm">
										{#if row.isUsd}
											<span class="text-muted-foreground">~</span>
										{:else}
											{autoUpdateLabel(row)}
										{/if}
									</Table.Cell>
									<Table.Cell class="text-muted-foreground text-sm">
										{#if row.isUsd}
											<span class="text-muted-foreground">~</span>
										{:else if row.latestDate}
											{formatDate(row.latestDate)}
										{:else}
											{m.currencies_no_quotes()}
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.latestRate === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Number value={formatNativeCurrency(row.latestRate, 2, row.code)} />
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
						{#if totalPages > 1}
							<Table.Footer>
								<Table.Row class="border-t">
									<Table.Cell colspan={5} class="bg-background px-0 py-3 whitespace-normal">
										<Pagination.Root
											count={totalItems}
											perPage={pageSize}
											page={currentPage}
											onPageChange={(newPage) => (currentPage = newPage)}
										>
											{#snippet children({ pages, currentPage: activePage })}
												<Pagination.Content
													class="flex flex-wrap items-center justify-center gap-1 px-4 sm:justify-between"
												>
													<Pagination.Item>
														<Pagination.PrevButton />
													</Pagination.Item>
													{#each pages as item (item.key)}
														<Pagination.Item>
															{#if item.type === 'page'}
																<Pagination.Link page={item} isActive={activePage === item.value}>
																	{item.value}
																</Pagination.Link>
															{:else}
																<Pagination.Ellipsis />
															{/if}
														</Pagination.Item>
													{/each}
													<Pagination.Item>
														<Pagination.NextButton />
													</Pagination.Item>
												</Pagination.Content>
											{/snippet}
										</Pagination.Root>
									</Table.Cell>
								</Table.Row>
							</Table.Footer>
						{/if}
					</Table.Root>
				</div>
			{/if}
		{/if}
	</Section>
</Page>
