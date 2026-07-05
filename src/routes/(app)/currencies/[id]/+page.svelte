<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAuthContext } from '$lib/auth.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import { formatNativeCurrency } from '$lib/components/currency';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { ExchangeRatesSourceOptions, type ExchangeRatesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import {
		createSortComparator,
		getSortFromUrl,
		sanitizeFromParam,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const currenciesContext = getCurrenciesContext();
	const exchangeRatesContext = getExchangeRatesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const recordId = $derived(page.params.id);
	const currency = $derived(
		recordId ? currenciesContext.currencies.find((row) => row.id === recordId) : undefined
	);
	const isLoaded = $derived(currenciesContext.isLoaded && exchangeRatesContext.isLoaded);
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

	let name = $state('');
	let autoUpdate = $state(false);
	let initializedCurrencyId = $state('');
	let quoteDate = $state(new Date().toISOString().slice(0, 10));
	let quoteRate = $state('');
	let currentPage = $state(1);

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	function responseFieldCode(error: ClientResponseError, field: string) {
		const data: unknown = error.response?.data;
		if (!isRecord(data)) return '';
		const fieldData = data[field];
		if (!isRecord(fieldData)) return '';
		const errorCode = fieldData.code;
		return typeof errorCode === 'string' ? errorCode : '';
	}

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

	const sortedRows = $derived.by(() => {
		if (!currency || isUsd) return [];
		const rows: QuoteRow[] = exchangeRatesContext.records
			.filter((record) => record.currency === currency.code)
			.map((record) => ({
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
		if (!currency) {
			if (currenciesContext.isLoaded && recordId) error(404, m.currencies_edit_error_not_found());
			return;
		}
		if (initializedCurrencyId !== currency.id) {
			name = currency.name;
			autoUpdate = currency.autoUpdate;
			initializedCurrencyId = currency.id;
		}
	});

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

	function dateToUtcIso(date: string) {
		return new Date(`${date}T00:00:00.000Z`).toISOString();
	}

	function findOwnManualQuote(
		records: ExchangeRatesResponse[],
		code: string,
		date: string,
		owner: string
	) {
		return records.find(
			(record) =>
				record.currency === code &&
				record.owner === owner &&
				record.source === ExchangeRatesSourceOptions.manual &&
				record.date.slice(0, 10) === date
		);
	}

	async function handleSubmit() {
		const currentId = recordId;
		if (!currentId || !currency) return;

		try {
			await pb.authedClient.collection('currencies').update(currentId, {
				name: name.trim(),
				autoUpdate: currency.code === 'USD' ? false : autoUpdate
			});
			toast.success(m.currencies_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('currencyDetail', 'update', error);
			toast.error(m.currencies_edit_failed());
		}
	}

	async function handleSaveQuote() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || !currency || isUsd) return;

		const rateValue = parseFloat(quoteRate.trim());
		if (!Number.isFinite(rateValue) || rateValue <= 0) {
			toast.error(m.currencies_rate_invalid());
			return;
		}

		try {
			const existing = findOwnManualQuote(
				exchangeRatesContext.records,
				currency.code,
				quoteDate,
				currentOwnerId
			);
			const successMessage = existing
				? m.currencies_quote_update_success()
				: m.currencies_quote_add_success();
			if (existing) {
				await pb.authedClient.collection('exchangeRates').update(existing.id, { rate: rateValue });
			} else {
				await pb.authedClient.collection('exchangeRates').create({
					owner: currentOwnerId,
					currency: currency.code,
					date: dateToUtcIso(quoteDate),
					rate: rateValue
				});
			}
			quoteRate = '';
			toast.success(successMessage);

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('currencyDetail', 'save_quote', error);
			toast.error(m.currencies_quote_save_failed());
		}
	}

	async function handleDelete() {
		const currentId = recordId;
		if (!currentId) return;

		try {
			await pb.authedClient.collection('currencies').delete(currentId);
			toast.success(m.currencies_delete_success());
			goto(resolve('/currencies'));
		} catch (error) {
			if (
				error instanceof ClientResponseError &&
				error.status === 400 &&
				responseFieldCode(error, 'currency') === 'currency_in_use'
			) {
				toast.error(m.currencies_delete_in_use());
				return;
			}
			logError('currencyDetail', 'delete', error);
			toast.error(m.currencies_delete_failed());
		}
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/currencies')}>{m.sidebar_currencies()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if !currenciesContext.isLoaded || !currency}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page>{currency.code}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.currencies_edit_page_title()}>
	{#if !currenciesContext.isLoaded || (currency && !isUsd)}
		<Section>
			<SectionTitle title={m.currencies_quote_entry_section_title()} />
			{#if !isLoaded || !currency}
				<Skeleton class="h-32" />
			{:else}
				<div class="bg-muted border-border overflow-hidden rounded border">
					<form
						onsubmit={(event) => {
							event.preventDefault();
							handleSaveQuote();
						}}
						class="space-y-0"
					>
						<Fieldset isFirst={true}>
							<FormFieldRow>
								<Label for="quote-date" class="justify-start pr-0 md:justify-end">
									{m.currencies_label_date()}
								</Label>
								<Input id="quote-date" type="date" bind:value={quoteDate} required />
							</FormFieldRow>

							<FormFieldRow>
								<Label for="quote-rate" class="justify-start pr-0 md:justify-end">
									{m.currencies_label_usd_exchange_rate()}
								</Label>
								<CurrencyField
									id="quote-rate"
									name="quote-rate"
									bind:value={quoteRate}
									currency={currency.code}
									required
								/>
							</FormFieldRow>
						</Fieldset>

						<footer class="border-border bg-border border-t p-2">
							<div class="flex justify-end">
								<Button type="submit">{m.currencies_button_add_quote()}</Button>
							</div>
						</footer>
					</form>
				</div>
			{/if}
		</Section>
	{/if}

	<Section>
		<SectionTitle title={m.currencies_section_details()} />
		{#if !currenciesContext.isLoaded || !currency}
			<Skeleton class="h-64" />
		{:else}
			<div class="bg-muted border-border overflow-hidden rounded border">
				<form
					onsubmit={(event) => {
						event.preventDefault();
						handleSubmit();
					}}
					class="space-y-0"
				>
					<Fieldset isFirst={true}>
						<FormFieldRow>
							<Label for="code" class="justify-start pr-0 md:justify-end">
								{m.currencies_label_code()}
							</Label>
							<Input id="code" value={currency.code} disabled />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="name" class="justify-start pr-0 md:justify-end">
									{m.currencies_label_name()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.currencies_text_optional()}</span>
							</div>
							<Input id="name" bind:value={name} class="bg-background" />
						</FormFieldRow>

						{#if isUsd}
							<FormFieldRow>
								<Label class="justify-start pr-0 md:justify-end">
									{m.currencies_label_base_currency()}
								</Label>
								<p class="text-muted-foreground text-sm">
									{m.currencies_usd_base_currency()}
								</p>
							</FormFieldRow>
						{/if}
					</Fieldset>

					{#if !isUsd}
						<Fieldset>
							<FormFieldRow>
								<Label class="justify-start pr-0 md:justify-end">
									{m.currencies_label_mark_as()}
								</Label>
								<CheckboxLabel
									id="auto-update"
									bind:checked={autoUpdate}
									label={m.currencies_label_auto_update()}
								/>
							</FormFieldRow>
						</Fieldset>
					{/if}

					<footer class="border-border bg-border border-t p-2">
						<div class="flex justify-end">
							<Button type="submit">{m.currencies_button_save()}</Button>
						</div>
					</footer>
				</form>
			</div>
		{/if}
	</Section>

	{#if !currenciesContext.isLoaded || (currency && !isUsd)}
		<Section>
			<SectionTitle title={m.currencies_quote_history_section_title()} />
			{#if !isLoaded || !currency}
				<Skeleton class="h-64" />
			{:else if sortedRows.length === 0}
				<Empty>
					{m.currencies_no_quotes()}
				</Empty>
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
		</Section>
	{/if}

	<Section>
		<SectionTitle title={m.danger_zone_title()} />
		{#if !currenciesContext.isLoaded || !currency}
			<Skeleton class="h-24" />
		{:else}
			<div
				class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
			>
				<div class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm">{m.currencies_delete_description()}</p>
						<p class="text-destructive text-sm">{m.currencies_delete_subtext()}</p>
					</div>
					<AlertDialog.Root>
						<AlertDialog.Trigger>
							<Button variant="destructive">{m.currencies_delete_button()}</Button>
						</AlertDialog.Trigger>
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.currencies_delete_confirm_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{m.currencies_delete_confirm_description()}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.currencies_delete_confirm_cancel()}</AlertDialog.Cancel>
								<AlertDialog.Action onclick={handleDelete}
									>{m.currencies_delete_confirm_continue()}</AlertDialog.Action
								>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Root>
				</div>
			</div>
		{/if}
	</Section>
</Page>
