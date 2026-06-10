<script lang="ts">
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import DisplayNumber from '$lib/components/number.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import {
		formatSecurityQuantity,
		securityTransactionTypeLabel
	} from '$lib/security-transaction-display';
	import { getSecurityTransactionsContext } from '$lib/security-transactions.svelte';

	const securityTxContext = getSecurityTransactionsContext();

	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	function formatDate(date: Date) {
		return dateFormatter.format(date);
	}
</script>

{#if securityTxContext.filteredRows.length === 0}
	<Empty>
		{m.trades_table_empty()}
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
						{m.trades_table_header_security()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.securities_table_header_symbol()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.trades_table_header_type()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_description()}
					</Table.Head>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_account()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.trades_table_header_quantity()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.trades_table_header_price()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_table_header_amount()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.trades_table_header_fees()}
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
						<Table.Cell class="whitespace-nowrap">
							<span class="text-foreground/90 text-sm font-medium">{row.securityName}</span>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground whitespace-nowrap">
							{#if row.securitySymbol}
								<span class="text-sm">{row.securitySymbol}</span>
							{:else}
								<span class="text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="text-sm">{securityTransactionTypeLabel(row.type)}</span>
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
							{#if row.quantity !== null}
								<DisplayNumber value={formatSecurityQuantity(row.quantity)} />
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
