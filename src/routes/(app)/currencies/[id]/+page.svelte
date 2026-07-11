<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BalanceHistoryChart from '$lib/components/balance-history-chart.svelte';
	import { formatNativeCurrency } from '$lib/components/currency';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Pagination from '$lib/components/ui/pagination/index';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import { ExchangeRatesSourceOptions, type ExchangeRatesResponse } from '$lib/pocketbase.schema';
	import {
		createSortComparator,
		getSortFromUrl,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	const currenciesContext = getCurrenciesContext();
	const exchangeRatesContext = getExchangeRatesContext();

	const recordId = $derived(page.params.id);
	const currency = $derived(
		recordId ? currenciesContext.currencies.find((row) => row.id === recordId) : undefined
	);
	const isLoaded = $derived(currenciesContext.isLoaded && exchangeRatesContext.isLoaded);
	const loaded = $derived(currenciesContext.isLoaded && !!currency);
	const isUsd = $derived(currency?.code === 'USD');

	type QuoteRow = {
		id: string;
		date: string;
		rate: number;
		source: ExchangeRatesSourceOptions;
		owner: string;
	};

	type QuoteSortColumn = 'date' | 'rate' | 'source';
	const validSortColumns: QuoteSortColumn[] = ['date', 'rate', 'source'];

	const defaultSort: SortState<QuoteSortColumn> = { column: 'date', direction: 'desc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl(page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as QuoteSortColumn)
		) {
			return urlSort as SortState<QuoteSortColumn>;
		}
		return defaultSort;
	});

	let currentPage = $state(1);

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as QuoteSortColumn);
		const newUrl = setSortInUrl(page.url, newState);
		currentPage = 1;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	function sourceLabel(source: ExchangeRatesSourceOptions) {
		return source === ExchangeRatesSourceOptions.manual
			? m.currencies_source_manual()
			: m.currencies_source_fetched();
	}

	const currencyQuotes = $derived(
		currency && !isUsd
			? exchangeRatesContext.records.filter((record) => record.currency === currency.code)
			: []
	);

	const ratePoints = $derived(
		[...currencyQuotes]
			.map((record) => ({ date: new Date(record.date), value: record.rate }))
			.sort((a, b) => a.date.getTime() - b.date.getTime())
	);
	const rateHistoryLoading = $derived(!exchangeRatesContext.isLoaded);

	const latestQuote = $derived.by(() => {
		return currencyQuotes.reduce<ExchangeRatesResponse | null>((latest, record) => {
			if (!latest || new Date(record.date).getTime() > new Date(latest.date).getTime()) {
				return record;
			}
			return latest;
		}, null);
	});

	const sortedRows = $derived.by(() => {
		const rows: QuoteRow[] = currencyQuotes.map((record) => ({
			id: record.id,
			date: record.date,
			rate: record.rate,
			source: record.source,
			owner: record.owner
		}));

		const comparator = createSortComparator<QuoteRow, QuoteSortColumn>(sortState, {
			date: (r) => new Date(r.date).getTime(),
			rate: (r) => r.rate,
			source: (r) => sourceLabel(r.source)
		});
		return rows.sort(comparator);
	});

	const pageSize = 50;
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

{#if !isUsd}
	<Section>
		<SectionTitle title={m.currencies_rate_history_section_title()} />
		{#if !loaded || rateHistoryLoading}
			<Skeleton class="h-[30vh] min-h-[220px]" showSpinner />
		{:else if currency && ratePoints.length >= 2}
			<div class="bg-background overflow-visible rounded-sm shadow-md">
				<BalanceHistoryChart
					points={ratePoints}
					seriesLabel={m.currencies_table_header_rate()}
					formatAxisValue={(value) => formatNativeCurrency(value, 2, currency.code)}
					formatTooltipValue={(value) => formatNativeCurrency(value, 2, currency.code)}
				/>
			</div>
		{:else}
			<div class="h-[30vh] min-h-[220px]">
				<Empty class="h-full">{m.currencies_rate_history_empty()}</Empty>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.currencies_quote_history_section_title()} />
		{#if !isLoaded || !currency}
			<Skeleton class="h-64" showSpinner />
		{:else}
			{#if latestQuote}
				<div
					role="region"
					aria-label={m.currencies_table_header_latest_quote()}
					class="grid grid-cols-1 gap-2"
				>
					<KeyValue
						title={m.currencies_table_header_latest_quote()}
						value={Math.round(latestQuote.rate * 100) / 100}
						variant="outline"
						format="number"
					/>
				</div>
			{/if}
			{#if sortedRows.length === 0}
				<Empty>{m.currencies_no_quotes()}</Empty>
			{:else}
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="date"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_date()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="source"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_source()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="rate"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.currencies_table_header_rate()}
								</Table.SortableHead>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each paginatedRows as row (row.id)}
								<Table.Row>
									<Table.Cell class="text-muted-foreground text-sm">
										{formatDate(row.date)}
									</Table.Cell>
									<Table.Cell class="text-foreground/80 text-sm">
										{sourceLabel(row.source)}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										<NumberDisplay value={formatNativeCurrency(row.rate, 2, currency.code)} />
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
						{#if totalPages > 1}
							<Table.Footer>
								<Table.Row class="border-t">
									<Table.Cell colspan={3} class="bg-background px-0 py-3 whitespace-normal">
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
{/if}
