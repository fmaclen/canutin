<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountCashflowContext } from '$lib/account-cashflow.svelte';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import {
		advanceTrendSecurityValue,
		type TrendSecurityBalance,
		type TrendSecurityValueState
	} from '$lib/balance-series';
	import BalanceHistoryChart from '$lib/components/balance-history-chart.svelte';
	import CashflowAverages from '$lib/components/cashflow-averages.svelte';
	import { formatNativeCurrency } from '$lib/components/currency';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import PositionsTable from '$lib/components/positions-table.svelte';
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
		type AccountBalancesResponse,
		type SecuritiesResponse,
		type SecurityBalancesResponse,
		type SecurityTransactionsResponse,
		type TransactionLabelsResponse,
		type TransactionsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import {
		compareByValueDescThenName,
		gainLossPercentOrNull,
		sentiment
	} from '$lib/security-balance-values';
	import { projectSignedValue } from '$lib/sharing';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, toNumber, type SortState } from '$lib/utils';

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
	type BalanceHistoryPoint = { date: Date; value: number };
	type SecurityBalanceRow = SecurityBalancesResponse<number, number, number, number>;

	const SAMPLE_LIMIT = 5;

	let transactionSamples = $state<TransactionSample[]>([]);
	let transactionTotal = $state(0);
	let tradeSamples = $state<TradeSample[]>([]);
	let tradeTotal = $state(0);
	let samplesLoading = $state(true);

	$effect(() => {
		const id = accountId;
		let cancelled = false;
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
				if (cancelled) return;
				transactionSamples = transactions.items;
				transactionTotal = transactions.totalItems;
				tradeSamples = trades.items;
				tradeTotal = trades.totalItems;
			} catch (error) {
				if (cancelled) return;
				pb.handleConnectionError(error, 'accounts', 'overview_samples');
			} finally {
				if (!cancelled) samplesLoading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
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

	const balanceHistoryAccountId = $derived(account?.id ?? '');
	const balanceHistoryAccountCurrency = $derived(account?.currency ?? '');
	const balanceHistoryPerspective = $derived(account?.perspective);
	const balanceHistoryAutoCalculated = $derived(Boolean(account?.autoCalculated));
	const balanceHistorySecurityCurrencyKey = $derived.by(() => {
		const id = balanceHistoryAccountId;
		if (!id) return '';
		return securitiesContext.securities
			.filter((security) =>
				securitiesContext
					.getAccountBalances(security.id)
					.some((balance) => balance.accountId === id)
			)
			.map((security) => `${security.id}:${security.currency}`)
			.sort()
			.join(',');
	});
	let balanceHistory = $state<BalanceHistoryPoint[]>([]);
	let balanceHistoryLoading = $state(true);

	$effect(() => {
		balanceHistory = [];
		balanceHistoryLoading = Boolean(balanceHistoryAccountId);
	});

	$effect(() => {
		const id = balanceHistoryAccountId;
		const currency = balanceHistoryAccountCurrency;
		const perspective = balanceHistoryPerspective;
		const autoCalculated = balanceHistoryAutoCalculated;
		const balanceEvent = accountsContext.lastBalanceEvent;
		const securityCurrencies = Object.fromEntries(
			balanceHistorySecurityCurrencyKey
				.split(',')
				.map((entry) => entry.split(':'))
				.filter((entry) => entry.length === 2)
		);
		let cancelled = false;
		if (!id || !currency || perspective === undefined || balanceEvent === 0) return;

		void (async () => {
			try {
				const cashPointsPromise = autoCalculated
					? pb.authedClient
							.collection('transactions')
							.getFullList<TransactionsResponse>({
								filter: `account='${id}'`,
								sort: 'date,created,id',
								fields: 'id,date,value,excluded',
								requestKey: null
							})
							.then((transactions) => {
								let running = 0;
								const points: BalanceHistoryPoint[] = [];
								for (const transaction of transactions) {
									if (transaction.excluded) continue;
									running += transaction.value ?? 0;
									const lastPoint = points.at(-1);
									if (lastPoint?.date.getTime() === new Date(transaction.date).getTime()) {
										lastPoint.value = running;
									} else {
										points.push({ date: new Date(transaction.date), value: running });
									}
								}
								return points;
							})
					: pb.authedClient
							.collection('accountBalances')
							.getFullList<AccountBalancesResponse>({
								filter: `account='${id}'`,
								sort: 'asOf,created,id',
								fields: 'id,value,asOf',
								requestKey: null
							})
							.then((balances) =>
								balances.map((balance) => ({
									date: new Date(balance.asOf),
									value: balance.value ?? 0
								}))
							);
				const [cashPoints, securityRows] = await Promise.all([
					cashPointsPromise,
					pb.authedClient.collection('securityBalances').getFullList<SecurityBalanceRow>({
						filter: `account='${id}'`,
						sort: 'security,asOf,created,id',
						fields: 'id,account,security,value,quantity,asOf,created',
						requestKey: null
					})
				]);
				if (cancelled) return;

				const securityGroups: { id: string; balances: TrendSecurityBalance[] }[] = [];
				let hasForeignSecurity = false;
				for (const row of securityRows) {
					const securityCurrency = securityCurrencies[row.security];
					if (securityCurrency !== undefined && securityCurrency !== currency) {
						hasForeignSecurity = true;
					}
					let group = securityGroups.find((candidate) => candidate.id === row.security);
					if (!group) {
						group = { id: row.security, balances: [] };
						securityGroups.push(group);
					}
					group.balances.push({
						id: row.id,
						account: row.account,
						security: row.security,
						value: row.value,
						quantity: row.quantity,
						asOf: row.asOf,
						created: row.created
					});
				}

				// NOTE: a native worth figure is undefined when the account holds foreign-currency securities
				// (mirrors AccountPositionsValue.nativeValue), so no single-currency series can be drawn.
				if (hasForeignSecurity && securityGroups.length > 0) {
					balanceHistory = [];
					balanceHistoryLoading = false;
					return;
				}

				const dateTimes = [
					...cashPoints.map((point) => point.date.getTime()),
					...securityRows.map((row) => new Date(row.asOf).getTime())
				]
					.sort((a, b) => a - b)
					.filter((time, index, times) => index === 0 || time !== times[index - 1]);
				const sortedCash = [...cashPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
				const securityStates: TrendSecurityValueState[] = securityGroups.map(() => ({
					index: -1,
					lastKnownValue: null,
					soldOut: false
				}));
				let cashIndex = -1;

				balanceHistory = dateTimes.map((time) => {
					const date = new Date(time);
					while (
						cashIndex + 1 < sortedCash.length &&
						sortedCash[cashIndex + 1].date.getTime() <= time
					) {
						cashIndex++;
					}
					const cash = cashIndex >= 0 ? sortedCash[cashIndex].value : 0;
					let positions = 0;
					for (const [index, group] of securityGroups.entries()) {
						const value = advanceTrendSecurityValue(group.balances, date, securityStates[index]);
						if (value !== null) positions += value;
					}
					return { date, value: projectSignedValue(cash + positions, perspective) };
				});
				balanceHistoryLoading = false;
			} catch (error) {
				if (cancelled) return;
				pb.handleConnectionError(error, 'accounts', 'balance_history');
				balanceHistoryLoading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

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
	const sort = new TableSort<PositionSortColumn>(validSortColumns, defaultSort);

	const positionsRows = $derived.by(() => {
		const rows = positionsBalances.map((balance) => ({
			...balance,
			entityId: balance.securityId,
			entityName: securitiesContext.getSecurity(balance.securityId)?.name ?? '',
			nativeCurrency: securitiesContext.getSecurity(balance.securityId)?.currency ?? 'USD'
		}));

		const comparator = createSortComparator<(typeof rows)[number], PositionSortColumn>(sort.state, {
			asOf: (row) => new Date(row.asOf).getTime(),
			securityName: (row) => row.entityName,
			quantity: (row) => row.quantity,
			price: (row) =>
				row.price === null ? null : fx.convert(row.price, row.nativeCurrency, row.asOf).value,
			costBasis: (row) => row.costBasis,
			gainLoss: (row) => row.gainLoss,
			gainLossPercent: (row) => gainLossPercentOrNull(row.gainLoss, row.costBasis),
			value: (row) => row.value
		});
		return rows.sort(comparator);
	});
	const topPositionsRows = $derived.by(() => {
		const topPositionIds = new Set(
			[...positionsRows]
				.sort(
					compareByValueDescThenName(
						(row) => row.value,
						(row) => row.entityName
					)
				)
				.slice(0, SAMPLE_LIMIT)
				.map((row) => row.id)
		);
		return positionsRows.filter((row) => topPositionIds.has(row.id));
	});
	const dateFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
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

<Section>
	<SectionTitle title={m.balance_history_section_title()} />
	{#if !loaded || balanceHistoryLoading || !account}
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

{#snippet positionsAndTrades()}
	<Section>
		<SectionTitle title={m.account_section_top_positions()} />
		{#if !loaded || securitiesContext.isLoading || !account}
			<Skeleton class="h-64" showSpinner />
		{:else if positionsRows.length > 0}
			<div
				class="grid overflow-hidden rounded-sm shadow-md [&>div]:rounded-none [&>div]:shadow-none"
			>
				<PositionsTable
					rows={topPositionsRows}
					entity="security"
					sortState={sort.state}
					onSort={sort.toggle}
				/>
				<div class="bg-background overflow-hidden">
					<Table.Root>
						<TableViewAllRow
							href={`${resolve('/portfolio')}?account=${account.id}`}
							label={positionsRows.length === 1
								? m.accounts_overview_view_all_positions_one()
								: m.accounts_overview_view_all_positions_other({
										count: positionsRows.length
									})}
							colspan={1}
						/>
					</Table.Root>
				</div>
			</div>
		{:else}
			<Empty>{m.accounts_overview_positions_empty()}</Empty>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.account_section_recent_trades()} />
		{#if !loaded || samplesLoading || !account}
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
										<Link href={resolve(`/trades/${row.id}`)} class="text-muted-foreground text-sm"
											>~</Link
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
{/snippet}

{#snippet cashflowAndTransactions()}
	<Section>
		{#if !loaded || accountCashflow.isLoading || !account}
			<SectionTitle title={m.trailing_cashflow_section_title()} />
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

	<Section>
		<SectionTitle title={m.account_section_recent_transactions()} />
		{#if !loaded || samplesLoading || !account}
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
{/snippet}

{#snippet samplePlaceholder()}
	<Section>
		<Skeleton class="h-7 w-40" />
		<Skeleton class="h-64" showSpinner />
	</Section>
{/snippet}

{#if !loaded}
	{@render samplePlaceholder()}
	{@render samplePlaceholder()}
	{@render samplePlaceholder()}
	{@render samplePlaceholder()}
{:else if isInvestmentAccount}
	{@render positionsAndTrades()}
	{@render cashflowAndTransactions()}
{:else}
	{@render cashflowAndTransactions()}
	{@render positionsAndTrades()}
{/if}
