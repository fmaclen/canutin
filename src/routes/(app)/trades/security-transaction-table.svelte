<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import DisplayNumber from '$lib/components/number.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import * as Pagination from '$lib/components/ui/pagination/index';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import {
		formatSecurityQuantity,
		securityTransactionTypeLabel
	} from '$lib/security-transaction-display';
	import { getSecurityTransactionsContext } from '$lib/security-transactions.svelte';

	const securityTxContext = getSecurityTransactionsContext();

	async function openTrade(event: MouseEvent, id: string) {
		event.preventDefault();
		const from = window.location.pathname + window.location.search;
		await goto(resolve(`/trades/${id}?from=${encodeURIComponent(from)}`));
	}

	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	function formatDate(date: Date) {
		return dateFormatter.format(date);
	}

	function amountClass(value: number) {
		if (value > 0) return 'text-cash';
		if (value < 0) return 'text-debt';
		return 'text-muted-foreground';
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
						{m.transactions_table_header_description()}
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
						{m.transactions_table_header_account()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.trades_table_header_quantity()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.trades_table_header_price()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.trades_table_header_fees()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_table_header_amount()}
					</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each securityTxContext.paginatedRows as row (row.id)}
					<Table.Row>
						<Table.Cell
							class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
						>
							{formatDate(row.date)}
						</Table.Cell>
						<Table.Cell>
							{#if row.description}
								<Link
									href="/trades/{row.id}"
									onclick={(event) => openTrade(event, row.id)}
									class="text-foreground/90 text-sm font-medium"
								>
									{row.description}
								</Link>
							{:else}
								<Link
									href="/trades/{row.id}"
									onclick={(event) => openTrade(event, row.id)}
									class="text-muted-foreground text-sm">~</Link
								>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if row.securityName && row.securityId}
								<Link
									href={resolve(`/trades/securities/${row.securityId}`)}
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
						<Table.Cell class="text-foreground/80 text-sm tracking-wide uppercase">
							{#if row.securitySymbol}
								{row.securitySymbol}
							{:else}
								<span class="text-muted-foreground">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							<div class="flex space-x-1.5">
								<span class="text-sm">{securityTransactionTypeLabel(row.type)}</span>
								{#if row.subtype}
									<span class="text-muted-foreground text-sm">{row.subtype}</span>
								{/if}
							</div>
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
							{#if row.fees !== null}
								<Currency value={row.fees} decimalScale={2} />
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell
							class={'text-right whitespace-nowrap tabular-nums ' +
								(row.amount !== null ? amountClass(row.amount) : '')}
						>
							{#if row.amount !== null}
								<Currency value={row.amount} decimalScale={2} />
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
			{#if securityTxContext.totalPages > 1}
				<Table.Footer>
					<Table.Row class="border-t">
						<Table.Cell colspan={10} class="bg-background px-0 py-3 whitespace-normal">
							<Pagination.Root
								count={securityTxContext.filteredRows.length}
								perPage={securityTxContext.pageSize}
								bind:page={securityTxContext.page}
							>
								{#snippet children({ pages, currentPage })}
									<Pagination.Content
										class="flex flex-wrap items-center justify-center gap-1 px-4 sm:justify-between"
									>
										<Pagination.Item>
											<Pagination.PrevButton />
										</Pagination.Item>
										{#each pages as item (item.key)}
											<Pagination.Item>
												{#if item.type === 'page'}
													<Pagination.Link page={item} isActive={currentPage === item.value}>
														{item.value}
													</Pagination.Link>
												{:else}
													<Pagination.Ellipsis />
												{/if}
											</Pagination.Item>
										{/each}
										<Pagination.Item>
											<Pagination.NextButton />
										</Pagination.Item>
									</Pagination.Content>
								{/snippet}
							</Pagination.Root>
						</Table.Cell>
					</Table.Row>
				</Table.Footer>
			{/if}
		</Table.Root>
	</div>
{/if}
