<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Currency, { getCurrencyFxLabel } from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import { badgeVariants } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext } from '$lib/transactions.svelte';
	import { cn } from '$lib/utils.js';

	const txContext = getTransactionsContext();

	async function openTransaction(event: MouseEvent, id: string) {
		event.preventDefault();
		const from = window.location.pathname + window.location.search;
		await goto(resolve(`/transactions/${id}?from=${encodeURIComponent(from)}`));
	}

	function handleSort(column: string) {
		txContext.setSort(column);
	}

	function amountClass(value: number) {
		if (value > 0) return 'text-cash';
		if (value < 0) return 'text-debt';
		return 'text-muted-foreground';
	}
</script>

{#if txContext.totalItems === 0}
	<Empty class="full-bleed">
		{m.transactions_table_empty()}
	</Empty>
{:else}
	<div class="full-bleed bg-background overflow-hidden rounded-sm shadow-md">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-10">
						<Checkbox
							checked={txContext.isAllVisibleSelected}
							indeterminate={txContext.isIndeterminate}
							onCheckedChange={() => {
								if (txContext.isAllVisibleSelected) {
									if (txContext.isAllFilteredSelected) {
										txContext.clearSelection();
									} else {
										txContext.deselectAllVisible();
									}
								} else {
									txContext.selectAllVisible();
								}
							}}
						/>
					</Table.Head>
					<Table.SortableHead
						class="text-left whitespace-nowrap"
						column="date"
						sortColumn={txContext.sortState.column}
						sortDirection={txContext.sortState.direction}
						onSort={handleSort}
					>
						{m.transactions_table_header_date()}
					</Table.SortableHead>
					<Table.SortableHead
						class="text-left whitespace-nowrap"
						column="description"
						sortColumn={txContext.sortState.column}
						sortDirection={txContext.sortState.direction}
						onSort={handleSort}
					>
						{m.transactions_table_header_description()}
					</Table.SortableHead>
					<Table.Head class="text-left whitespace-nowrap">
						{m.transactions_table_header_labels()}
					</Table.Head>
					<Table.SortableHead
						class="text-left whitespace-nowrap"
						column="account"
						sortColumn={txContext.sortState.column}
						sortDirection={txContext.sortState.direction}
						onSort={handleSort}
					>
						{m.transactions_table_header_account()}
					</Table.SortableHead>
					<Table.SortableHead
						class="text-right whitespace-nowrap"
						column="amount"
						sortColumn={txContext.sortState.column}
						sortDirection={txContext.sortState.direction}
						onSort={handleSort}
					>
						{m.transactions_table_header_amount()}
					</Table.SortableHead>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each txContext.paginatedRows as row (row.id)}
					{@const isSelected = txContext.selectedIds.has(row.id)}
					<Table.Row
						class={row.excluded
							? 'bg-muted/30'
							: isSelected
								? '[&>td]:bg-brand-secondary odd:[&>td]:bg-brand-secondary'
								: ''}
					>
						<Table.Cell class="w-10">
							<Checkbox
								checked={isSelected}
								onCheckedChange={() => txContext.toggleSelection(row.id)}
							/>
						</Table.Cell>
						<Table.Cell
							class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
						>
							{row.date.toISOString().slice(0, 10)}
						</Table.Cell>
						<Table.Cell>
							{#if row.description}
								<Link
									href="/transactions/{row.id}"
									onclick={(event) => openTransaction(event, row.id)}
									title={row.description}
									class="cell-truncate text-foreground/90 text-sm font-medium"
								>
									{row.description}
								</Link>
							{:else}
								<Link
									href="/transactions/{row.id}"
									onclick={(event) => openTransaction(event, row.id)}
									class="text-muted-foreground text-sm">~</Link
								>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if row.labelChips.length}
								<div class="flex flex-wrap gap-2 max-sm:max-w-[18ch]">
									{#each row.labelChips as label (label.id)}
										{@const isActive = txContext.labelFilters.includes(label.id)}
										<button
											type="button"
											class={cn(
												badgeVariants({ variant: 'outline' }),
												'hover:border-brand hover:text-brand cursor-pointer'
											)}
											aria-pressed={isActive}
											aria-label={m.transactions_filter_by_label({ name: label.name })}
											onclick={() => txContext.toggleLabelFilter(label.id)}
										>
											{label.name}
										</button>
									{/each}
								</div>
							{:else}
								<span class="text-muted-foreground text-xs">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{#if row.accountName && row.accountId}
								<RecordLink
									type="account"
									id={row.accountId}
									name={row.accountName}
									isShared={row.accountIsShared}
									class="cell-truncate text-foreground/80 text-sm"
								/>
							{:else if row.accountName}
								<span class="cell-truncate text-foreground/80 text-sm" title={row.accountName}
									>{row.accountName}</span
								>
							{:else}
								<span class="text-muted-foreground text-sm">~</span>
							{/if}
						</Table.Cell>
						<Table.Cell
							class={'text-right whitespace-nowrap tabular-nums ' +
								(row.excluded ? 'text-muted-foreground' : amountClass(row.displayValue))}
						>
							{#if row.excluded}
								<Tooltip.Root>
									<Tooltip.Trigger
										class="border-border inline-block border-b border-dashed leading-none hover:border-current"
									>
										<Currency
											value={row.displayValue}
											decimalScale={2}
											isConverted={row.isConverted}
											isUnconverted={row.isUnconverted}
											missingCurrency={row.missingCurrency}
											nativeCurrency={row.nativeCurrency}
											nativeValue={row.value}
											showFxTooltip={false}
										/>
									</Tooltip.Trigger>
									<Tooltip.Content sideOffset={6}>
										<p class="text-xs leading-snug font-normal">
											{m.transactions_amount_tooltip_excluded()}
										</p>
										{#if row.isConverted || row.isUnconverted}
											<p class="text-xs leading-snug font-normal">
												{getCurrencyFxLabel({
													decimalScale: 2,
													isUnconverted: row.isUnconverted,
													missingCurrency: row.missingCurrency,
													nativeCurrency: row.nativeCurrency,
													nativeValue: row.value
												})}
											</p>
										{/if}
									</Tooltip.Content>
								</Tooltip.Root>
							{:else}
								<Currency
									value={row.displayValue}
									decimalScale={2}
									isConverted={row.isConverted}
									isUnconverted={row.isUnconverted}
									missingCurrency={row.missingCurrency}
									nativeCurrency={row.nativeCurrency}
									nativeValue={row.value}
								/>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
			{#if txContext.totalPages > 1}
				<Table.Footer>
					<Table.Row class="border-t">
						<Table.Cell colspan={6} class="bg-background px-0 py-3 whitespace-normal">
							<Pagination.Root
								count={txContext.totalItems}
								perPage={txContext.pageSize}
								page={txContext.page}
								onPageChange={(page) => txContext.setPage(page)}
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
