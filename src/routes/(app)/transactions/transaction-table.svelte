<script lang="ts">
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext } from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();

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

{#if txContext.filteredRows.length === 0}
	<Empty>
		{m.transactions_table_empty()}
	</Empty>
{:else}
	<div class="bg-background overflow-hidden rounded-sm shadow-md" aria-busy={txContext.isLoading}>
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
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_account()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">
						{m.transactions_table_header_amount()}
					</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each txContext.paginatedRows as row (row.id)}
					<Table.Row class={row.excluded ? 'bg-muted/30' : ''}>
						<Table.Cell
							class="font-jetbrains-mono text-muted-foreground text-xs uppercase tabular-nums"
						>
							{formatDate(row.date)}
						</Table.Cell>
						<Table.Cell>
							{#if row.description}
								<Link href="/transactions/{row.id}" class="text-foreground/90 text-sm font-medium">
									{row.description}
								</Link>
							{:else}
								<Link href="/transactions/{row.id}" class="text-muted-foreground text-sm">~</Link>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if row.labels.length}
								<div class="flex flex-wrap gap-2">
									{#each row.labels as label, labelIndex (row.id + '-' + labelIndex)}
										<Badge variant="outline">
											{label}
										</Badge>
									{/each}
								</div>
							{:else}
								<span class="text-muted-foreground text-xs">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if row.accountName}
								<span class="text-foreground/80 text-sm">{row.accountName}</span>
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell
							class={'font-jetbrains-mono text-right text-xs tabular-nums ' +
								(row.excluded ? 'text-muted-foreground' : amountClass(row.value))}
						>
							{#if row.excluded}
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed hover:border-current"
									>
										<Currency value={row.value} maximumFractionDigits={2} />
									</Tooltip.Trigger>
									<Tooltip.Content sideOffset={6}>
										<p class="text-xs leading-snug font-normal">
											{m.transactions_amount_tooltip_excluded()}
										</p>
									</Tooltip.Content>
								</Tooltip.Root>
							{:else}
								<Currency value={row.value} maximumFractionDigits={2} />
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
			{#if txContext.totalPages > 1}
				<Table.Footer>
					<Table.Row class="border-t">
						<Table.Cell colspan={5} class="bg-background px-0 py-3 whitespace-normal">
							<Pagination.Root
								count={txContext.filteredRows.length}
								perPage={txContext.pageSize}
								bind:page={txContext.page}
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
