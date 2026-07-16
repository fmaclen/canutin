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

	type PositionValueRow = {
		id: string;
		quantity: number | null;
		costBasis: number | null;
		gainLoss: number | null;
		value: number | null;
		isConverted: boolean;
		isUnconverted: boolean;
		missingCurrency?: string | null;
		nativeCurrency?: string;
		nativeValue?: number | null;
		nativeCostBasis?: number | null;
		nativeGainLoss?: number | null;
	};
	type PositionRow = PositionValueRow & {
		asOf: string;
		entityId: string;
		entityName: string;
		nativeCurrency: string;
		price: number | null;
		missingCurrency: string | null;
		nativeValue: number | null;
		nativeCostBasis: number | null;
		nativeGainLoss: number | null;
	};
	type AggregatePositionRow = PositionValueRow & {
		name: string;
		symbol: string | null;
		accounts: Array<{ id: string; name: string }>;
	};
	type Props = {
		rows: PositionRow[] | AggregatePositionRow[];
		entity: 'account' | 'security' | 'aggregate';
		sortState: SortState;
		onSort: (column: string) => void;
	};

	let { rows, entity, sortState, onSort }: Props = $props();

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
				{#if entity === 'aggregate'}
					<Table.SortableHead
						class="text-left whitespace-nowrap"
						column="name"
						sortColumn={sortState.column}
						sortDirection={sortState.direction}
						{onSort}
					>
						{m.securities_table_header_security()}
					</Table.SortableHead>
					<Table.SortableHead
						class="text-left whitespace-nowrap"
						column="symbol"
						sortColumn={sortState.column}
						sortDirection={sortState.direction}
						{onSort}
					>
						{m.securities_table_header_symbol()}
					</Table.SortableHead>
					<Table.Head class="text-left whitespace-nowrap">
						{m.securities_table_header_accounts()}
					</Table.Head>
				{:else}
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
				{/if}
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="quantity"
					sortColumn={sortState.column}
					sortDirection={sortState.direction}
					{onSort}
				>
					{m.securities_table_header_quantity()}
				</Table.SortableHead>
				{#if entity !== 'aggregate'}
					<Table.SortableHead
						class="text-right whitespace-nowrap"
						column="price"
						sortColumn={sortState.column}
						sortDirection={sortState.direction}
						{onSort}
					>
						{m.securities_table_header_price()}
					</Table.SortableHead>
				{/if}
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
					{#if entity === 'aggregate' && 'accounts' in row}
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
					{:else if 'entityId' in row}
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
					{/if}
					<Table.Cell class="text-right tabular-nums">
						{#if row.quantity === null}
							<span class="text-muted-foreground">~</span>
						{:else}
							<NumberDisplay value={formatSecurityQuantity(row.quantity)} />
						{/if}
					</Table.Cell>
					{#if entity !== 'aggregate' && 'price' in row}
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
					{/if}
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
