<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { createAccountBalanceHistoryLoader } from '$lib/account-balance-history.svelte';
	import { getAccountCashflowContext } from '$lib/account-cashflow.svelte';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import BalanceHistoryChart from '$lib/components/balance-history-chart.svelte';
	import CashflowAverages from '$lib/components/cashflow-averages.svelte';
	import { formatNativeCurrency } from '$lib/components/currency';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import SharedRecordReadonlyBanner from '$lib/components/shared-record-readonly-banner.svelte';
	import TableViewAllRow from '$lib/components/table-view-all-row.svelte';
	import { badgeVariants } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		AccountsBalanceGroupOptions,
		type SecuritiesResponse,
		type SecurityTransactionsResponse,
		type TransactionLabelsResponse,
		type TransactionsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
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
		toNumber,
		type SortState
	} from '$lib/utils';

	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	const accountCashflow = getAccountCashflowContext();
	const fx = getExchangeRatesContext();
	const pb = getPocketBaseContext();

	const accountId = $derived(page.params.id);
	const account = $derived(accountId ? accountsContext.getAccount(accountId) : null);
	const isLoading = $derived(accountsContext.isLoading);
	const loaded = $derived(!isLoading && !!account);
	const canWrite = $derived(Boolean(account?.canWrite));

	type TransactionSample = TransactionsResponse<{ labels?: TransactionLabelsResponse[] }>;
	type TradeSample = SecurityTransactionsResponse<
		number,
		number,
		number,
		number,
		{ security?: SecuritiesResponse }
	>;

	const SAMPLE_LIMIT = 10;

	let transactionSamples = $state<TransactionSample[]>([]);
	let transactionTotal = $state(0);
	let tradeSamples = $state<TradeSample[]>([]);
	let tradeTotal = $state(0);
	let samplesLoading = $state(true);

	$effect(() => {
		const id = accountId;
		transactionSamples = [];
		transactionTotal = 0;
		tradeSamples = [];
		tradeTotal = 0;
		samplesLoading = true;
		if (!id) return;
		void (async () => {
			try {
				const [transactions, trades] = await Promise.all([
					pb.authedClient.collection('transactions').getList<TransactionSample>(1, SAMPLE_LIMIT, {
						filter: `account='${id}'`,
						sort: '-date,-created,-id',
						expand: 'labels',
						fields: 'id,date,description,value,excluded,labels,expand.labels.id,expand.labels.name',
						requestKey: `accountOverview:transactions:${id}`
					}),
					pb.authedClient.collection('securityTransactions').getList<TradeSample>(1, SAMPLE_LIMIT, {
						filter: `account='${id}'`,
						sort: '-date,-created,-id',
						expand: 'security',
						fields:
							'id,date,description,name,security,amount,expand.security.id,expand.security.name,expand.security.currency',
						requestKey: `accountOverview:trades:${id}`
					})
				]);
				if (accountId !== id) return;
				transactionSamples = transactions.items;
				transactionTotal = transactions.totalItems;
				tradeSamples = trades.items;
				tradeTotal = trades.totalItems;
			} catch (error) {
				pb.handleConnectionError(error, 'accounts', 'overview_samples');
			} finally {
				if (accountId === id) samplesLoading = false;
			}
		})();
	});

	const transactionRows = $derived.by(() => {
		if (!account) return [];
		const nativeCurrency = account.currency;
		const inverse = account.perspective === 'INVERSE';
		return transactionSamples.map((txn) => {
			const dateIso = txn.date;
			const rawValue = txn.value ?? 0;
			const value = inverse ? -rawValue : rawValue;
			const conversion = fx.convert(value, nativeCurrency, dateIso);
			const labelChips = (txn.expand?.labels ?? [])
				.filter((label): label is typeof label & { name: string } => Boolean(label.name))
				.map((label) => ({ id: label.id, name: label.name }))
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
			return {
				id: txn.id,
				date: new Date(dateIso),
				description: (txn.description ?? '').trim(),
				labelChips,
				nativeCurrency,
				nativeValue: value,
				displayValue: conversion.value,
				isConverted: conversion.isConverted,
				isUnconverted: conversion.isUnconverted,
				missingCurrency: conversion.missingCurrency
			};
		});
	});

	const tradeRows = $derived.by(() =>
		tradeSamples.map((trade) => {
			const date = new Date(trade.date);
			const amount = toNumber(trade.amount);
			const securityCurrency = trade.expand?.security?.currency ?? 'USD';
			const conversion =
				amount === null ? null : fx.convert(amount, securityCurrency, date.toISOString());
			return {
				id: trade.id,
				date,
				description: (trade.description || trade.name || '').trim(),
				securityId: trade.security || null,
				securityName: trade.expand?.security?.name ?? '',
				securityCurrency,
				amount,
				conversion
			};
		})
	);

	const balanceHistoryLoader = createAccountBalanceHistoryLoader(
		pb,
		() => account,
		(securityId) => securitiesContext.getSecurity(securityId)?.currency
	);
	const balanceHistory = $derived(balanceHistoryLoader.history);
	const balanceHistoryLoading = $derived(balanceHistoryLoader.isLoading);

	const positionsBalances = $derived(
		account
			? securitiesContext.securities.flatMap((security) =>
					securitiesContext
						.getAccountBalances(security.id)
						.filter((balance) => balance.accountId === account.id && balance.quantity !== 0)
				)
			: []
	);
	type PositionSortColumn =
		| 'asOf'
		| 'securityName'
		| 'quantity'
		| 'price'
		| 'costBasis'
		| 'gainLoss'
		| 'gainLossPercent'
		| 'value';
	const validSortColumns: PositionSortColumn[] = [
		'asOf',
		'securityName',
		'quantity',
		'price',
		'costBasis',
		'gainLoss',
		'gainLossPercent',
		'value'
	];

	const defaultSort: SortState<PositionSortColumn> = { column: 'value', direction: 'desc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl(page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as PositionSortColumn)
		) {
			return urlSort as SortState<PositionSortColumn>;
		}
		return defaultSort;
	});

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as PositionSortColumn);
		const newUrl = setSortInUrl(page.url, newState);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	const positionsRows = $derived.by(() => {
		const rows = positionsBalances.map((balance) => ({
			...balance,
			securityName: securitiesContext.getSecurity(balance.securityId)?.name ?? '',
			securityCurrency: securitiesContext.getSecurity(balance.securityId)?.currency ?? 'USD'
		}));

		const comparator = createSortComparator<(typeof rows)[number], PositionSortColumn>(sortState, {
			asOf: (row) => new Date(row.asOf).getTime(),
			securityName: (row) => row.securityName,
			quantity: (row) => row.quantity,
			price: (row) =>
				row.price === null ? null : fx.convert(row.price, row.securityCurrency, row.asOf).value,
			costBasis: (row) => row.costBasis,
			gainLoss: (row) => row.gainLoss,
			gainLossPercent: (row) => gainLossPercentOrNull(row.gainLoss, row.costBasis),
			value: (row) => row.value
		});
		return rows.sort(comparator);
	});
	const positionsMarketValue = $derived({
		value: sumOrUnknown(positionsRows.map((row) => (row.isUnconverted ? 0 : row.value))),
		isUnconverted: positionsRows.some((row) => row.isUnconverted)
	});
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

	const showBanner = $derived(loaded && !canWrite);
	// NOTE: avg1y spans the full 12-month window, so both figures being zero means the account has no
	// trailing transactions to average - render the empty state rather than $0/$0/$0 tiles.
	const hasCashflow = $derived(
		accountCashflow.avg1y.income !== 0 || accountCashflow.avg1y.expenses !== 0
	);
	const isInvestmentAccount = $derived(
		account?.balanceGroup === AccountsBalanceGroupOptions.INVESTMENT
	);
</script>

{#if showBanner}
	<Section>
		<SharedRecordReadonlyBanner title={m.accounts_readonly_title()} />
	</Section>
{/if}

{#if loaded && account}
	<Section>
		<SectionTitle title={m.balance_history_section_title()} />
		{#if balanceHistoryLoading}
			<Skeleton class="h-[30vh] min-h-[220px]" showSpinner />
		{:else if balanceHistory.length >= 2}
			<div class="bg-background overflow-visible rounded-sm shadow-md">
				<BalanceHistoryChart
					points={balanceHistory}
					seriesLabel={m.balance_history_series_label()}
					formatAxisValue={(value) => formatNativeCurrency(Math.round(value), 0, account.currency)}
					formatTooltipValue={(value) => formatNativeCurrency(value, 2, account.currency)}
				/>
			</div>
		{:else}
			<div class="h-[30vh] min-h-[220px]">
				<Empty class="h-full">{m.balance_history_empty()}</Empty>
			</div>
		{/if}
	</Section>
{/if}

{#snippet positionsAndTrades()}
	{#if loaded && account}
		<Section>
			<SectionTitle title={m.portfolio_section_positions()} />
			{#if securitiesContext.isLoading}
				<Skeleton class="h-64" showSpinner />
			{:else if positionsRows.length > 0}
				<div
					role="region"
					aria-label={m.portfolio_section_positions()}
					class="grid grid-cols-1 gap-2"
				>
					<KeyValue
						title={m.summary_net_market_value()}
						value={positionsMarketValue.value}
						variant="outline"
						decimalScale={2}
						isUnconverted={positionsMarketValue.isUnconverted}
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
									column="securityName"
									sortColumn={sortState.column}
									sortDirection={sortState.direction}
									onSort={handleSort}
								>
									{m.securities_table_header_security()}
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
							{#each positionsRows as row (row.id)}
								{@const gainLossPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
								<Table.Row>
									<Table.Cell
										class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
									>
										{dateFormatter.format(new Date(row.asOf))}
									</Table.Cell>
									<Table.Cell>
										<Link
											href={resolve(`/securities/${row.securityId}`)}
											class="text-foreground/90 text-sm font-medium"
										>
											{row.securityName}
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
											{@const priceFx = fx.convert(row.price, row.securityCurrency, row.asOf)}
											<Currency
												value={priceFx.value}
												decimalScale={2}
												isConverted={priceFx.isConverted}
												isUnconverted={priceFx.isUnconverted}
												missingCurrency={priceFx.missingCurrency}
												nativeCurrency={row.securityCurrency}
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
												nativeCurrency={row.securityCurrency}
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
												nativeCurrency={row.securityCurrency}
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
												nativeCurrency={row.securityCurrency}
												nativeValue={row.nativeValue ?? undefined}
											/>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<Empty>{m.accounts_overview_positions_empty()}</Empty>
			{/if}
		</Section>
	{/if}

	{#if loaded && account}
		<Section>
			<SectionTitle title={m.trades_title()} />
			{#if samplesLoading}
				<Skeleton class="h-64" showSpinner />
			{:else if tradeRows.length > 0}
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="text-left whitespace-nowrap">
									{m.transactions_table_header_date()}
								</Table.Head>
								<Table.Head class="text-left whitespace-nowrap">
									{m.transactions_table_header_description()}
								</Table.Head>
								<Table.Head class="text-left whitespace-nowrap">
									{m.trades_table_header_security()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.transactions_table_header_amount()}
								</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each tradeRows as row (row.id)}
								<Table.Row>
									<Table.Cell
										class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
									>
										{dateFormatter.format(row.date)}
									</Table.Cell>
									<Table.Cell>
										{#if row.description}
											<Link
												href={resolve(`/trades/${row.id}`)}
												class="text-foreground/90 text-sm font-medium"
											>
												{row.description}
											</Link>
										{:else}
											<Link
												href={resolve(`/trades/${row.id}`)}
												class="text-muted-foreground text-sm">~</Link
											>
										{/if}
									</Table.Cell>
									<Table.Cell>
										{#if row.securityName && row.securityId}
											<Link
												href={resolve(`/securities/${row.securityId}`)}
												class="text-foreground/80 text-sm"
											>
												{row.securityName}
											</Link>
										{:else if row.securityName}
											<span class="text-foreground/80 text-sm">{row.securityName}</span>
										{:else}
											<span class="text-muted-foreground text-sm">~</span>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right whitespace-nowrap tabular-nums">
										{#if row.amount !== null && row.conversion}
											<Currency
												value={row.conversion.value}
												decimalScale={2}
												sentiment={sentiment(row.conversion.value)}
												isConverted={row.conversion.isConverted}
												isUnconverted={row.conversion.isUnconverted}
												missingCurrency={row.conversion.missingCurrency}
												nativeCurrency={row.securityCurrency}
												nativeValue={row.amount}
											/>
										{:else}
											<span class="text-muted-foreground text-sm">~</span>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
						<TableViewAllRow
							href={`${resolve('/trades')}?account=${account.id}`}
							label={tradeTotal === 1
								? m.accounts_overview_view_all_trades_one()
								: m.accounts_overview_view_all_trades_other({ count: tradeTotal })}
							colspan={4}
						/>
					</Table.Root>
				</div>
			{:else}
				<Empty>{m.accounts_overview_trades_empty()}</Empty>
			{/if}
		</Section>
	{/if}
{/snippet}

{#snippet cashflowAndTransactions()}
	{#if loaded && account}
		<Section>
			{#if accountCashflow.isLoading}
				<Skeleton class="h-32" />
			{:else if hasCashflow}
				<CashflowAverages
					avg3m={accountCashflow.avg3m}
					avg6m={accountCashflow.avg6m}
					avgYtd={accountCashflow.avgYtd}
					avg1y={accountCashflow.avg1y}
				/>
			{:else}
				<SectionTitle title={m.trailing_cashflow_section_title()} />
				<Empty>{m.accounts_overview_cashflow_empty()}</Empty>
			{/if}
		</Section>
	{/if}

	{#if loaded && account}
		<Section>
			<SectionTitle title={m.sidebar_transactions()} />
			{#if samplesLoading}
				<Skeleton class="h-64" showSpinner />
			{:else if transactionRows.length > 0}
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="text-left whitespace-nowrap">
									{m.transactions_table_header_date()}
								</Table.Head>
								<Table.Head class="text-left whitespace-nowrap">
									{m.transactions_table_header_description()}
								</Table.Head>
								<Table.Head class="text-left whitespace-nowrap">
									{m.transactions_table_header_labels()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.transactions_table_header_amount()}
								</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each transactionRows as row (row.id)}
								<Table.Row>
									<Table.Cell
										class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
									>
										{dateFormatter.format(row.date)}
									</Table.Cell>
									<Table.Cell>
										{#if row.description}
											<Link
												href={resolve(`/transactions/${row.id}`)}
												class="text-foreground/90 text-sm font-medium"
											>
												{row.description}
											</Link>
										{:else}
											<Link
												href={resolve(`/transactions/${row.id}`)}
												class="text-muted-foreground text-sm">~</Link
											>
										{/if}
									</Table.Cell>
									<Table.Cell>
										{#if row.labelChips.length}
											<div class="flex flex-wrap gap-2">
												{#each row.labelChips as label (label.id)}
													<span class={badgeVariants({ variant: 'outline' })}>{label.name}</span>
												{/each}
											</div>
										{:else}
											<span class="text-muted-foreground text-xs">~</span>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right whitespace-nowrap tabular-nums">
										<Currency
											value={row.displayValue}
											decimalScale={2}
											sentiment={sentiment(row.displayValue)}
											isConverted={row.isConverted}
											isUnconverted={row.isUnconverted}
											missingCurrency={row.missingCurrency}
											nativeCurrency={row.nativeCurrency}
											nativeValue={row.nativeValue}
										/>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
						<TableViewAllRow
							href={`${resolve('/transactions')}?account=${account.id}`}
							label={transactionTotal === 1
								? m.accounts_overview_view_all_transactions_one()
								: m.accounts_overview_view_all_transactions_other({ count: transactionTotal })}
							colspan={4}
						/>
					</Table.Root>
				</div>
			{:else}
				<Empty>{m.accounts_overview_transactions_empty()}</Empty>
			{/if}
		</Section>
	{/if}
{/snippet}

{#if isInvestmentAccount}
	{@render positionsAndTrades()}
	{@render cashflowAndTransactions()}
{:else}
	{@render cashflowAndTransactions()}
	{@render positionsAndTrades()}
{/if}
