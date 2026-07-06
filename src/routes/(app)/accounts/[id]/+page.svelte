<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountCashflowContext } from '$lib/account-cashflow.svelte';
	import { getAccountsContext, type AccountWithBalance } from '$lib/accounts.svelte';
	import { createBalanceHistoryLoader } from '$lib/balance-history.svelte';
	import BalanceHistoryChart from '$lib/components/balance-history-chart.svelte';
	import CashflowAverages from '$lib/components/cashflow-averages.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import SharedRecordReadonlyBanner from '$lib/components/shared-record-readonly-banner.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { AccountBalancesResponse } from '$lib/pocketbase.schema';
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

	let transactionCount = $state<number | null>(null);
	let tradeCount = $state<number | null>(null);

	$effect(() => {
		const id = accountId;
		transactionCount = null;
		tradeCount = null;
		if (!id) return;
		void (async () => {
			try {
				const [transactions, trades] = await Promise.all([
					pb.authedClient.collection('transactions').getList(1, 1, {
						filter: `account='${id}'`,
						fields: 'id',
						requestKey: `accountOverview:transactions:${id}`
					}),
					pb.authedClient.collection('securityTransactions').getList(1, 1, {
						filter: `account='${id}'`,
						fields: 'id',
						requestKey: `accountOverview:trades:${id}`
					})
				]);
				if (accountId !== id) return;
				transactionCount = transactions.totalItems;
				tradeCount = trades.totalItems;
			} catch (error) {
				pb.handleConnectionError(error, 'accounts', 'overview_counts');
			}
		})();
	});

	const balanceHistoryLoader = createBalanceHistoryLoader<
		AccountWithBalance,
		AccountBalancesResponse
	>(
		pb,
		'accounts',
		() => account,
		(current) =>
			pb.authedClient.collection('accountBalances').getFullList<AccountBalancesResponse>({
				filter: `account='${current.id}'`,
				sort: 'asOf,created,id',
				fields: 'id,value,asOf',
				requestKey: null
			}),
		(record) => record.value ?? 0
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
	const showPositions = $derived(
		loaded && (securitiesContext.isLoading || positionsRows.length > 0)
	);
	// NOTE: hide trailing cashflow when the trailing window holds no transactions (e.g. brokerage
	// accounts) so the section doesn't render as $0/$0/$0 noise. avg1y spans the full 12-month
	// window, so both figures being zero means there's nothing to average.
	const showCashflow = $derived(
		loaded &&
			(accountCashflow.isLoading ||
				accountCashflow.avg1y.income !== 0 ||
				accountCashflow.avg1y.expenses !== 0)
	);
	const showBalanceHistory = $derived(
		loaded && (balanceHistoryLoading || balanceHistory.length >= 2)
	);
	const showEmpty = $derived(
		loaded && !showBanner && !showBalanceHistory && !showPositions && !showCashflow
	);
</script>

{#if showBanner}
	<Section>
		<SharedRecordReadonlyBanner title={m.accounts_readonly_title()} />
	</Section>
{/if}

{#if loaded && account}
	<Section>
		<SectionTitle title={m.accounts_overview_section_activity()} />
		<div
			role="region"
			aria-label={m.accounts_overview_section_activity()}
			class="grid grid-cols-1 gap-2 sm:grid-cols-2"
		>
			<Link
				href={`${resolve('/transactions')}?account=${account.id}`}
				class="hover:ring-brand/50 focus-visible:ring-brand block rounded-sm no-underline transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
			>
				<KeyValue
					title={m.sidebar_transactions()}
					value={transactionCount}
					variant="outline"
					format="number"
				/>
			</Link>
			<Link
				href={`${resolve('/trades')}?account=${account.id}`}
				class="hover:ring-brand/50 focus-visible:ring-brand block rounded-sm no-underline transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
			>
				<KeyValue title={m.trades_title()} value={tradeCount} variant="outline" format="number" />
			</Link>
		</div>
	</Section>
{/if}

{#if showBalanceHistory && account}
	<Section>
		<SectionTitle title={m.balance_history_section_title()} />
		{#if balanceHistoryLoading}
			<Skeleton class="h-64" showSpinner />
		{:else}
			<div class="bg-background overflow-visible rounded-sm shadow-md">
				<BalanceHistoryChart points={balanceHistory} currency={account.currency} />
			</div>
		{/if}
	</Section>
{/if}

{#if showPositions}
	<Section>
		<SectionTitle title={m.portfolio_section_positions()} />
		{#if securitiesContext.isLoading}
			<Skeleton class="h-64" showSpinner />
		{:else}
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
		{/if}
	</Section>
{/if}

{#if showCashflow}
	<Section>
		{#if accountCashflow.isLoading}
			<Skeleton class="h-32" />
		{:else}
			<CashflowAverages
				avg3m={accountCashflow.avg3m}
				avg6m={accountCashflow.avg6m}
				avgYtd={accountCashflow.avgYtd}
				avg1y={accountCashflow.avg1y}
			/>
		{/if}
	</Section>
{/if}

{#if showEmpty}
	<Section>
		<Empty>{m.accounts_overview_empty()}</Empty>
	</Section>
{/if}
