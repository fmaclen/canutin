<script lang="ts">
	import { resolve } from '$app/paths';
	import Currency from '$lib/components/currency.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import * as Table from '$lib/components/ui/table/index';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		formatSecurityQuantity,
		gainLossPercentOrNull,
		sentiment
	} from '$lib/security-balance-values';
	import { formatPercent, type SortState } from '$lib/utils';

	type PositionRow = {
		id: string;
		asOf: string;
		entityId: string;
		entityName: string;
		nativeCurrency: string;
		quantity: number | null;
		price: number | null;
		costBasis: number | null;
		gainLoss: number | null;
		value: number | null;
		isConverted: boolean;
		isUnconverted: boolean;
		missingCurrency: string | null;
		nativeValue: number | null;
		nativeCostBasis: number | null;
		nativeGainLoss: number | null;
	};

	let {
		rows,
		entity,
		sortState,
		onSort
	}: {
		rows: PositionRow[];
		entity: 'account' | 'security';
		sortState: SortState;
		onSort: (column: string) => void;
	} = $props();

	const fx = getExchangeRatesContext();
	const dateFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
</script>

<div class="bg-background overflow-hidden rounded-sm shadow-md">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.SortableHead
					class="text-left whitespace-nowrap"
					column="asOf"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_as_of()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-left whitespace-nowrap"
					column={entity === 'account' ? 'accountName' : 'securityName'}
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{entity === 'account'
						? m.securities_table_header_account()
						: m.securities_table_header_security()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="quantity"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_quantity()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="price"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_price()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="costBasis"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_cost_basis()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="gainLoss"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_gain_loss()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="gainLossPercent"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_gain_loss_percent()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="value"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_value()}
				</Table.SortableHead>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.id)}
				{@const gainLossPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
				<Table.Row>
					<Table.Cell
						class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
					>
						{dateFormatter.format(new Date(row.asOf))}
					</Table.Cell>
					<Table.Cell>
						<Link
							href={entity === 'account'
								? resolve(`/accounts/${row.entityId}`)
								: resolve(`/securities/${row.entityId}`)}
							class="text-foreground/90 text-sm font-medium"
						>
							{row.entityName}
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
							{@const priceFx = fx.convert(row.price, row.nativeCurrency, row.asOf)}
							<Currency
								value={priceFx.value}
								decimalScale={2}
								isConverted={priceFx.isConverted}
								isUnconverted={priceFx.isUnconverted}
								missingCurrency={priceFx.missingCurrency}
								nativeCurrency={row.nativeCurrency}
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
								nativeCurrency={row.nativeCurrency}
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
								nativeCurrency={row.nativeCurrency}
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
								nativeCurrency={row.nativeCurrency}
								nativeValue={row.nativeValue ?? undefined}
							/>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
