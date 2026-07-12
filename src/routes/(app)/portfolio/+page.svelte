<script lang="ts">
	import { resolve } from '$app/paths';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext, type SecurityAggregate } from '$lib/securities.svelte';
	import {
		formatSecurityQuantity,
		gainLossPercentOrNull,
		sentiment
	} from '$lib/security-balance-values';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, formatPercent, type SortState } from '$lib/utils';

	const securitiesContext = getSecuritiesContext();

	// NOTE: aggregateRows already carries its own display-currency conversion (value/costBasis/
	// gainLoss + isConverted/isUnconverted); this just sorts and sums those.
	const rows = $derived(securitiesContext.aggregateRows);

	type PortfolioSortColumn =
		| 'name'
		| 'symbol'
		| 'quantity'
		| 'costBasis'
		| 'gainLoss'
		| 'gainLossPercent'
		| 'value';
	const validSortColumns: PortfolioSortColumn[] = [
		'name',
		'symbol',
		'quantity',
		'costBasis',
		'gainLoss',
		'gainLossPercent',
		'value'
	];

	const defaultSort: SortState<PortfolioSortColumn> = { column: 'value', direction: 'desc' };
	const sort = new TableSort<PortfolioSortColumn>(validSortColumns, defaultSort);

	const sortedRows = $derived.by(() => {
		const comparator = createSortComparator<SecurityAggregate, PortfolioSortColumn>(sort.state, {
			name: (r) => r.name,
			symbol: (r) => r.symbol,
			quantity: (r) => r.quantity,
			costBasis: (r) => r.costBasis,
			gainLoss: (r) => r.gainLoss,
			gainLossPercent: (r) => gainLossPercentOrNull(r.gainLoss, r.costBasis),
			value: (r) => r.value
		});
		return [...rows].sort(comparator);
	});

	const marketValueTotal = $derived(
		rows.some((row) => row.value === null)
			? null
			: rows.reduce((sum, row) => sum + (row.value ?? 0), 0)
	);
	const gainLossTotal = $derived(
		rows.some((row) => row.gainLoss === null)
			? null
			: rows.reduce((sum, row) => sum + (row.gainLoss ?? 0), 0)
	);
	const costBasisTotal = $derived(
		rows.some((row) => row.costBasis === null)
			? null
			: rows.reduce((sum, row) => sum + (row.costBasis ?? 0), 0)
	);
	const returnPercent = $derived(
		gainLossTotal === null || costBasisTotal === null || costBasisTotal === 0
			? null
			: (gainLossTotal / costBasisTotal) * 100
	);
	// NOTE: value/costBasis/gainLoss share one isConverted/isUnconverted pair per row (they're
	// converted from the same security currency + balance date), so one pair covers every total.
	const isTotalsUnconverted = $derived(rows.some((row) => row.isUnconverted));
</script>

<Page pageTitle={m.portfolio_page_title()}>
	<Section>
		<SectionTitle title={m.portfolio_section_positions()} />
		{#if securitiesContext.isLoading}
			<Skeleton class="h-64" showSpinner />
		{:else if rows.length === 0}
			<Empty>{m.portfolio_empty()}</Empty>
		{:else}
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<KeyValue
					title={m.summary_net_gain_loss()}
					value={gainLossTotal}
					variant="outline"
					decimalScale={2}
					isUnconverted={isTotalsUnconverted}
				/>
				<KeyValue
					title={m.summary_net_gain_percent()}
					value={returnPercent}
					variant="outline"
					format="percent"
				/>
				<KeyValue
					title={m.summary_net_market_value()}
					value={marketValueTotal}
					variant="outline"
					decimalScale={2}
					isUnconverted={isTotalsUnconverted}
				/>
			</div>
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
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
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_accounts()}
							</Table.Head>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="quantity"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_quantity()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="costBasis"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_cost_basis()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="gainLoss"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_gain_loss()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="gainLossPercent"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_gain_loss_percent()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="value"
								sortColumn={sort.column}
								sortDirection={sort.direction}
								onSort={sort.toggle}
							>
								{m.securities_table_header_value()}
							</Table.SortableHead>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each sortedRows as row (row.id)}
							{@const gainLossPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
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
								<Table.Cell class="text-foreground/80 max-w-80 text-sm">
									<div class="flex flex-wrap gap-x-1.5 gap-y-0.5">
										{#each row.accounts as account (account.id)}
											<Link
												href={resolve(`/accounts/${account.id}`)}
												class="text-foreground/80 text-sm"
											>
												{account.name}
											</Link>
										{/each}
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.quantity === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<NumberDisplay value={formatSecurityQuantity(row.quantity)} />
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
</Page>
