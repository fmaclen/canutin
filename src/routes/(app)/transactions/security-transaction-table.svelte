<script lang="ts">
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import DisplayNumber from '$lib/components/number.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import {
		getSecurityTransactionsContext,
		type SecurityTransactionTypeFilter
	} from '$lib/security-transactions.svelte';

	const securityTxContext = getSecurityTransactionsContext();

	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const decimalFormatter = new Intl.NumberFormat(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 6
	});

	function formatDate(date: Date) {
		return dateFormatter.format(date);
	}

	function typeLabel(type: SecurityTransactionTypeFilter) {
		switch (type) {
			case 'buy':
				return m.transactions_security_type_buy();
			case 'sell':
				return m.transactions_security_type_sell();
			case 'cancel':
				return m.transactions_security_type_cancel();
			case 'cash':
				return m.transactions_security_type_cash();
			case 'fee':
				return m.transactions_security_type_fee();
			case 'transfer':
				return m.transactions_security_type_transfer();
			case 'all':
			default:
				return m.transactions_security_filter_type_all();
		}
	}

	function formatQuantity(value: number | null) {
		if (value === null) return null;
		return decimalFormatter.format(value);
	}
</script>

{#if securityTxContext.filteredRows.length === 0}
	<Empty>
		{m.transactions_security_table_empty()}
	</Empty>
{:else}
	<div class="bg-background overflow-hidden rounded-sm shadow-md">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_date()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_security_table_header_security()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_security_table_header_type()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_description()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_account()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_security_table_header_quantity()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_security_table_header_price()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_table_header_amount()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_security_table_header_fees()}
					</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each securityTxContext.filteredRows as row (row.id)}
					<Table.Row>
						<Table.Cell
							class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
						>
							{formatDate(row.date)}
						</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="text-foreground/90 text-sm font-medium">{row.securityName}</span>
								{#if row.securitySymbol}
									<span class="text-muted-foreground text-xs">{row.securitySymbol}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="text-sm">{typeLabel(row.type)}</span>
								{#if row.subtype}
									<span class="text-muted-foreground text-xs">{row.subtype}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell>
							{#if row.description}
								<span class="text-foreground/80 text-sm">{row.description}</span>
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if row.accountName && row.accountId}
								<RecordLink
									type="account"
									id={row.accountId}
									name={row.accountName}
									isShared={row.accountIsShared}
									class="text-foreground/80 text-sm"
								/>
							{:else if row.accountName}
								<span class="text-foreground/80 text-sm">{row.accountName}</span>
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap tabular-nums">
							{@const formattedQuantity = formatQuantity(row.quantity)}
							{#if formattedQuantity}
								<DisplayNumber value={formattedQuantity} />
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap tabular-nums">
							{#if row.price !== null}
								<Currency value={row.price} decimalScale={2} />
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap tabular-nums">
							{#if row.amount !== null}
								<Currency value={row.amount} decimalScale={2} />
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap tabular-nums">
							{#if row.fees !== null}
								<Currency value={row.fees} decimalScale={2} />
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}
