<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import Currency from '$lib/components/currency.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext, type SecurityAccountBalance } from '$lib/securities.svelte';
	import {
		formatSecurityQuantity,
		gainLossPercentOrNull,
		sumOrUnknown
	} from '$lib/security-balance-values';
	import {
		createSortComparator,
		formatPercent,
		getSortFromUrl,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	import BalanceFields from '../balance-fields.svelte';
	import { createSecurityBalanceFormData, toSecurityBalanceInput } from '../balance-form';
	import DetailsForm from './details-form.svelte';

	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	const fx = getExchangeRatesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const securityId = $derived(page.params.id);
	const security = $derived(securityId ? securitiesContext.getSecurity(securityId) : null);
	const securityCurrency = $derived(security?.currency ?? 'USD');
	const accountBalances = $derived(
		securityId ? securitiesContext.getAccountBalances(securityId) : []
	);
	const balancesMarketValue = $derived({
		value: sumOrUnknown(accountBalances.map((row) => (row.isUnconverted ? 0 : row.value))),
		isUnconverted: accountBalances.some((row) => row.isUnconverted)
	});

	type BalanceSortColumn =
		| 'asOf'
		| 'accountName'
		| 'quantity'
		| 'price'
		| 'costBasis'
		| 'gainLoss'
		| 'gainLossPercent'
		| 'value';
	const validSortColumns: BalanceSortColumn[] = [
		'asOf',
		'accountName',
		'quantity',
		'price',
		'costBasis',
		'gainLoss',
		'gainLossPercent',
		'value'
	];

	const defaultSort: SortState<BalanceSortColumn> = { column: 'value', direction: 'desc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl(page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as BalanceSortColumn)
		) {
			return urlSort as SortState<BalanceSortColumn>;
		}
		return defaultSort;
	});

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as BalanceSortColumn);
		const newUrl = setSortInUrl(page.url, newState);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	const sortedBalances = $derived.by(() => {
		const comparator = createSortComparator<SecurityAccountBalance, BalanceSortColumn>(sortState, {
			asOf: (r) => new Date(r.asOf).getTime(),
			accountName: (r) => r.accountName,
			quantity: (r) => r.quantity,
			price: (r) => (r.price === null ? null : fx.convert(r.price, securityCurrency, r.asOf).value),
			costBasis: (r) => r.costBasis,
			gainLoss: (r) => r.gainLoss,
			gainLossPercent: (r) => gainLossPercentOrNull(r.gainLoss, r.costBasis),
			value: (r) => r.value
		});
		return [...accountBalances].sort(comparator);
	});

	let formData = $state({
		name: '',
		symbol: ''
	});
	let balanceFormData = $state(createSecurityBalanceFormData());
	let isSavingBalance = $state(false);

	let syncState = $state({
		lastSyncedVersion: '',
		initialized: false,
		justSaved: false
	});
	const eligibleAccounts = $derived(
		accountsContext.accounts.filter((account) => !account.closed && account.canWrite)
	);

	const dateFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});

	function sentiment(value: number | null) {
		if (value === null || value === 0) return 'neutral';
		return value > 0 ? 'positive' : 'negative';
	}

	function securityVersion() {
		if (!security) return '';
		return `${security.updated || security.created}_${security.name}_${security.symbol}`;
	}

	function syncForm() {
		if (!security) return;
		formData = {
			name: security.name,
			symbol: security.symbol ?? ''
		};
		syncState.lastSyncedVersion = securityVersion();
		syncState.initialized = true;
	}

	$effect(() => {
		if (!security) {
			if (!securitiesContext.isLoading && securityId) {
				error(404, m.securities_error_not_found());
			}
			return;
		}

		const currentVersion = securityVersion();
		if (!syncState.initialized) {
			syncForm();
			return;
		}

		if (syncState.lastSyncedVersion === currentVersion) return;
		if (syncState.justSaved) {
			syncState.lastSyncedVersion = currentVersion;
			syncState.justSaved = false;
			return;
		}
		syncForm();
	});

	async function handleUpdateDetails() {
		if (!securityId) return;
		const securityName = formData.name.trim();
		if (!securityName) {
			toast.error(m.securities_name_required());
			return;
		}

		try {
			syncState.justSaved = true;
			await securitiesContext.updateSecurity(securityId, {
				name: securityName,
				symbol: formData.symbol.trim()
			});
			toast.success(m.securities_edit_success());
		} catch (error) {
			logError('securityDetail', 'update', error);
			syncState.justSaved = false;
			toast.error(m.securities_edit_failed());
		}
	}

	async function handleAddBalance() {
		const currentSecurityId = securityId;
		const currentOwnerId = ownerId;
		if (!currentSecurityId || !currentOwnerId || isSavingBalance) return;
		if (!balanceFormData.accountId) {
			toast.error(m.account_required());
			return;
		}

		try {
			isSavingBalance = true;
			await securitiesContext.addSecurityBalance(
				currentSecurityId,
				toSecurityBalanceInput(balanceFormData, currentOwnerId)
			);
			balanceFormData = createSecurityBalanceFormData();
			toast.success(m.securities_balance_updated());
		} catch (error) {
			logError('securityDetail', 'add_balance', error);
			toast.error(m.securities_balance_failed());
		} finally {
			isSavingBalance = false;
		}
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/trades/securities')}
						>{m.securities_title()}</Breadcrumb.Link
					>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if securitiesContext.isLoading || !security}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page>{security.name}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="flex items-center gap-4 px-4">
		{#if security}
			<Link href={`${resolve('/trades')}?security=${security.id}`} class="text-sm">
				{m.trades_title()}
			</Link>
		{/if}
	</nav>
</header>

<Page pageTitle={m.securities_edit_page_title()}>
	{#if securitiesContext.isLoading || accountBalances.length > 0}
		<Section>
			<SectionTitle title={m.securities_section_balances()} />
			{#if securitiesContext.isLoading}
				<Skeleton class="h-64" showSpinner />
			{:else}
				<div
					role="region"
					aria-label={m.securities_section_balances()}
					class="grid grid-cols-1 gap-2 sm:grid-cols-2"
				>
					<KeyValue
						title={m.securities_section_balances()}
						value={accountBalances.length}
						variant="outline"
						format="number"
					/>
					<KeyValue
						title={m.summary_net_market_value()}
						value={balancesMarketValue.value}
						variant="outline"
						decimalScale={2}
						isUnconverted={balancesMarketValue.isUnconverted}
					/>
				</div>
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="asOf"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_as_of()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-left whitespace-nowrap"
									column="accountName"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_account()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="quantity"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_quantity()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="price"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_price()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="costBasis"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_cost_basis()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="gainLoss"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_gain_loss()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="gainLossPercent"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_gain_loss_percent()}
								</Table.SortableHead>
								<Table.SortableHead
									class="text-right whitespace-nowrap"
									column="value"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_value()}
								</Table.SortableHead>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each sortedBalances as row (row.id)}
								{@const gainLossPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
								<Table.Row>
									<Table.Cell
										class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
									>
										{dateFormatter.format(new Date(row.asOf))}
									</Table.Cell>
									<Table.Cell>
										<Link
											href={resolve(`/accounts/${row.accountId}`)}
											class="text-foreground/90 text-sm font-medium"
										>
											{row.accountName}
										</Link>
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.quantity === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<NumberDisplay value={formatSecurityQuantity(row.quantity)} />
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.price === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											{@const priceFx = fx.convert(row.price, securityCurrency, row.asOf)}
											<Currency
												value={priceFx.value}
												decimalScale={2}
												isConverted={priceFx.isConverted}
												isUnconverted={priceFx.isUnconverted}
												missingCurrency={priceFx.missingCurrency}
												nativeCurrency={securityCurrency}
												nativeValue={row.price}
											/>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.costBasis === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency
												value={row.costBasis}
												decimalScale={2}
												isConverted={row.isConverted}
												isUnconverted={row.isUnconverted}
												missingCurrency={row.missingCurrency}
												nativeCurrency={securityCurrency}
												nativeValue={row.nativeCostBasis ?? undefined}
											/>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.gainLoss === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency
												value={row.gainLoss}
												decimalScale={2}
												sentiment={sentiment(row.gainLoss)}
												isConverted={row.isConverted}
												isUnconverted={row.isUnconverted}
												missingCurrency={row.missingCurrency}
												nativeCurrency={securityCurrency}
												nativeValue={row.nativeGainLoss ?? undefined}
											/>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if gainLossPercent === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<NumberDisplay
												value={formatPercent(gainLossPercent)}
												sentiment={gainLossPercent > 0
													? 'positive'
													: gainLossPercent < 0
														? 'negative'
														: 'neutral'}
											/>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.value === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency
												value={row.value}
												decimalScale={2}
												sentiment={sentiment(row.value)}
												isConverted={row.isConverted}
												isUnconverted={row.isUnconverted}
												missingCurrency={row.missingCurrency}
												nativeCurrency={securityCurrency}
												nativeValue={row.nativeValue ?? undefined}
											/>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</Section>
	{/if}

	<Section>
		<SectionTitle title={m.securities_section_add_balance()} />
		{#if securitiesContext.isLoading}
			<Skeleton class="h-36" />
		{:else}
			<div class="bg-muted border-border overflow-hidden rounded border">
				<form
					onsubmit={(event) => {
						event.preventDefault();
						handleAddBalance();
					}}
					class="space-y-0"
				>
					<BalanceFields
						formData={balanceFormData}
						accounts={eligibleAccounts}
						currency={securityCurrency}
						isFirst={true}
						disabled={isSavingBalance}
					/>

					<footer class="border-border bg-border border-t p-2">
						<div class="flex justify-end">
							<Button type="submit" disabled={isSavingBalance}>
								{m.securities_button_add_balance()}
							</Button>
						</div>
					</footer>
				</form>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.securities_section_details()} />
		{#if securitiesContext.isLoading || !security}
			<Skeleton class="h-36" />
		{:else}
			<DetailsForm {formData} currency={securityCurrency} onSubmit={handleUpdateDetails} />
		{/if}
	</Section>
</Page>
