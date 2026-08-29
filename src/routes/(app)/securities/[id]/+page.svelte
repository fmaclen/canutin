<script lang="ts">
	import { page } from '$app/state';
	import { formatNativeCurrency } from '$lib/components/currency';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import PositionsTable from '$lib/components/positions-table.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import TimeSeriesChart from '$lib/components/time-series-chart.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SecurityBalancesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext, type SecurityAccountBalance } from '$lib/securities.svelte';
	import { gainLossPercentOrNull } from '$lib/security-balance-values';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, sumPartial, type SortState } from '$lib/utils';

	const securitiesContext = getSecuritiesContext();
	const fx = getExchangeRatesContext();
	const pb = getPocketBaseContext();

	const securityId = $derived(page.params.id);
	const security = $derived(securityId ? securitiesContext.getSecurity(securityId) : null);
	const securityCurrency = $derived(security?.currency ?? 'USD');
	const loaded = $derived(!securitiesContext.isLoading && !!security);
	const accountBalances = $derived(
		securityId ? securitiesContext.getAccountBalances(securityId) : []
	);

	type SecurityPricePoint = { date: Date; value: number };
	let priceHistory: SecurityPricePoint[] = $state([]);
	let priceHistoryLoading = $state(true);

	$effect(() => {
		const id = securityId;
		priceHistory = [];
		priceHistoryLoading = true;
		if (!id) return;
		let cancelled = false;
		pb.authedClient
			.collection('securityBalances')
			.getFullList<SecurityBalancesResponse<number, number, number, number>>({
				filter: `security='${id}'`,
				sort: 'asOf,created,id',
				fields: 'id,asOf,price,created',
				requestKey: null
			})
			.then((records) => {
				if (cancelled) return;
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe scratch, discarded after building priceHistory
				const latestByDate = new Map<string, SecurityPricePoint>();
				for (const record of records) {
					if (record.price === null) continue;
					latestByDate.set(record.asOf, { date: new Date(record.asOf), value: record.price });
				}
				priceHistory = [...latestByDate.values()];
				priceHistoryLoading = false;
			})
			.catch((error) => {
				if (cancelled) return;
				pb.handleConnectionError(error, 'securities', 'price_history');
				priceHistoryLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});
	const balancesMarketValue = $derived(
		sumPartial(accountBalances.map((row) => (row.isUnconverted ? null : row.value)))
	);

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
	const sort = new TableSort<BalanceSortColumn>(validSortColumns, defaultSort);

	const sortedBalances = $derived.by(() => {
		const comparator = createSortComparator<SecurityAccountBalance, BalanceSortColumn>(sort.state, {
			asOf: (r) => new Date(r.asOf).getTime(),
			accountName: (r) => r.accountName,
			quantity: (r) => r.quantity,
			price: (r) => (r.price === null ? null : fx.convert(r.price, securityCurrency, r.asOf).value),
			costBasis: (r) => r.costBasis,
			gainLoss: (r) => r.gainLoss,
			gainLossPercent: (r) => gainLossPercentOrNull(r.gainLoss, r.costBasis),
			value: (r) => r.value
		});
		return [...accountBalances].sort(comparator).map((row) => ({
			...row,
			entityId: row.accountId,
			entityName: row.accountName,
			nativeCurrency: securityCurrency
		}));
	});
</script>

<Section>
	<TimeSeriesChart
		title={m.securities_section_price_history()}
		isLoading={!loaded || priceHistoryLoading}
		rows={priceHistory}
		period="max"
		series={[
			{
				key: 'value',
				label: m.securities_price_history_series_label(),
				color: 'var(--brand)',
				value: (point) => point.value
			}
		]}
		emptyMessage={m.securities_price_history_empty()}
		formatAxisValue={(value) => formatNativeCurrency(Math.round(value), 0, securityCurrency)}
		formatTooltipValue={(value) => formatNativeCurrency(value, 2, securityCurrency)}
	/>
</Section>

<Section>
	<SectionTitle title={m.securities_section_positions()} />
	{#if !loaded || !security}
		<Skeleton class="h-64" showSpinner />
	{:else if accountBalances.length > 0}
		<div
			role="region"
			aria-label={m.securities_section_positions()}
			class="grid grid-cols-1 gap-2 max-sm:-mt-0.5 max-sm:mb-4 sm:grid-cols-2"
		>
			<KeyValue
				title={m.securities_summary_count_label()}
				value={accountBalances.length}
				variant="outline"
				format="number"
			/>
			<KeyValue
				title={m.summary_net_market_value()}
				value={balancesMarketValue.total}
				variant="outline"
				decimalScale={2}
				isPartial={balancesMarketValue.isPartial}
			/>
		</div>
		<PositionsTable
			rows={sortedBalances}
			entity="account"
			sortState={sort.state}
			onSort={sort.toggle}
		/>
	{:else}
		<Empty>{m.securities_positions_empty()}</Empty>
	{/if}
</Section>
