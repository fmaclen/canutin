<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import Currency, { getCurrencyFxLabel } from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { m } from '$lib/paraglide/messages';
	import {
		PlaidConnectionsStatusOptions,
		type PlaidConnectionsResponse,
		type TransactionsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, sumPartial, type SortState } from '$lib/utils';

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	const accountsContext = getAccountsContext();

	const groupMeta: Record<
		BalanceGroup,
		{ label: string; badge: 'cash' | 'debt' | 'investment' | 'other' }
	> = {
		CASH: { label: m.accounts_group_cash_label(), badge: 'cash' },
		DEBT: { label: m.accounts_group_debt_label(), badge: 'debt' },
		INVESTMENT: { label: m.accounts_group_investment_label(), badge: 'investment' },
		OTHER: { label: m.accounts_group_other_label(), badge: 'other' }
	};

	type FilterOption = 'all' | 'open' | 'closed';

	type AccountRow = {
		id: string;
		name: string;
		institution: string | null;
		balance: number | null;
		isConverted: boolean;
		isUnconverted: boolean;
		missingCurrency: string | null;
		nativeCurrency: string;
		nativeBalance: number | null;
		typeName: string;
		balanceGroup: BalanceGroup;
		autoCalculated: boolean;
		participantExcluded: boolean;
		closed: boolean;
		isShared: boolean;
		isLinked: boolean;
		needsReauth: boolean;
	};

	const filters: Array<{
		key: FilterOption;
		label: string;
		empty: string;
		predicate: (row: AccountRow) => boolean;
	}> = [
		{
			key: 'all',
			label: m.accounts_filter_all_label(),
			empty: m.accounts_filter_all_empty(),
			predicate: () => true
		},
		{
			key: 'open',
			label: m.accounts_filter_open_label(),
			empty: m.accounts_filter_open_empty(),
			predicate: (row) => !row.closed
		},
		{
			key: 'closed',
			label: m.accounts_filter_closed_label(),
			empty: m.accounts_filter_closed_empty(),
			predicate: (row) => row.closed
		}
	];

	let filter: FilterOption = $state('open');
	const pb = getPocketBaseContext();
	const transactionsCounts = new SvelteMap<string, number>();
	const connectionStatuses = new SvelteMap<string, PlaidConnectionsStatusOptions>();

	type AccountSortColumn = 'name' | 'institution' | 'balance' | 'transactions';
	const validSortColumns: AccountSortColumn[] = ['name', 'institution', 'balance', 'transactions'];

	const defaultSort: SortState<AccountSortColumn> = { column: 'balance', direction: 'desc' };
	const sort = new TableSort<AccountSortColumn>(validSortColumns, defaultSort);

	const sortedRows = $derived.by(() => {
		const rows = accountsContext.accounts.map((account) => ({
			id: account.id,
			name: account.name,
			institution: account.institution ?? null,
			balance: account.displayBalance,
			isConverted: account.isConverted,
			isUnconverted: account.isUnconverted,
			missingCurrency: account.missingCurrency,
			nativeCurrency: account.currency,
			nativeBalance: account.balance,
			typeName: accountsContext.getTypeName(account.balanceType),
			balanceGroup: account.balanceGroup as BalanceGroup,
			autoCalculated: Boolean(account.autoCalculated),
			participantExcluded: account.participantExcluded,
			closed: Boolean(account.closed),
			isShared: account.isShared,
			isLinked: connectionStatuses.has(account.connection),
			needsReauth:
				connectionStatuses.get(account.connection) === PlaidConnectionsStatusOptions.reauth_required
		}));

		const comparator = createSortComparator<AccountRow, AccountSortColumn>(sort.state, {
			name: (r) => r.name,
			institution: (r) => r.institution,
			balance: (r) => r.balance,
			transactions: (r) => transactionsCounts.get(r.id) ?? 0
		});
		return rows.sort(comparator);
	});

	const rowsByFilter = $derived.by(() => {
		const map = new SvelteMap<FilterOption, AccountRow[]>();
		for (const option of filters)
			map.set(
				option.key,
				sortedRows.filter((row) => option.predicate(row))
			);
		return map;
	});

	type AccountsTotal = { value: number | null; isPartial: boolean };

	const totalsByFilter = $derived.by(() => {
		const totals = new SvelteMap<FilterOption, AccountsTotal>();
		for (const option of filters) {
			const rows = rowsByFilter.get(option.key) ?? [];
			// NOTE: on the "open" tab, excluded accounts don't count toward the net balance, so
			// they're dropped before summing/flagging rather than counted as a converted 0.
			const contributing = rows.filter(
				(row) => !(option.key === 'open' && row.participantExcluded)
			);
			const result = sumPartial(contributing.map((row) => row.balance));
			totals.set(option.key, {
				value: result.total,
				isPartial: result.isPartial || contributing.some((row) => row.isUnconverted)
			});
		}
		return totals;
	});

	async function refreshTransactionsTotals() {
		try {
			const txns = await pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse>({
					fields: 'id,account,value,excluded',
					requestKey: 'accounts:transactionsTotals'
				});
			const map = new SvelteMap<string, number>();
			for (const txn of txns) {
				const accountId = txn.account;
				if (!accountId) continue;
				map.set(accountId, (map.get(accountId) ?? 0) + 1);
			}
			transactionsCounts.clear();
			for (const [accountId, count] of map) transactionsCounts.set(accountId, count);
		} catch (error) {
			pb.handleConnectionError(error, 'accounts', 'refresh_transactions_totals');
		}
	}

	// The status of every connection is all the list needs: which accounts are linked and which of
	// those have gone stale.
	async function refreshConnections() {
		try {
			const connections = await pb.authedClient
				.collection('plaidConnections')
				.getFullList<PlaidConnectionsResponse>({
					fields: 'id,status',
					requestKey: 'accounts:connections'
				});
			connectionStatuses.clear();
			for (const connection of connections)
				connectionStatuses.set(connection.id, connection.status);
		} catch (error) {
			pb.handleConnectionError(error, 'accounts', 'refresh_connections');
		}
	}

	$effect(() => {
		void refreshTransactionsTotals();
		void refreshConnections();
	});

	const isLoaded = $derived(accountsContext.lastBalanceEvent !== 0);

	function balanceSentiment(row: AccountRow) {
		if (row.closed || row.participantExcluded) return 'neutral';
		if (row.balance === null || row.balance === 0) return 'neutral';
		return row.balance > 0 ? 'positive' : 'negative';
	}

	const statusMeta = {
		auto: {
			label: m.accounts_status_auto_label(),
			description: m.accounts_status_auto_description()
		},
		excluded: {
			label: m.accounts_status_excluded_label(),
			description: m.accounts_status_excluded_description()
		},
		closed: {
			label: m.accounts_status_closed_label(),
			description: m.accounts_status_closed_description()
		}
	} satisfies Record<'auto' | 'excluded' | 'closed', { label: string; description: string }>;

	type StatusBadgeId = keyof typeof statusMeta;
	type StatusBadge = { id: StatusBadgeId; label: string; description: string };

	function statusBadges(row: AccountRow) {
		const statuses: StatusBadge[] = [];
		if (row.autoCalculated) statuses.push({ id: 'auto', ...statusMeta.auto });
		if (row.participantExcluded) statuses.push({ id: 'excluded', ...statusMeta.excluded });
		if (row.closed) statuses.push({ id: 'closed', ...statusMeta.closed });
		return statuses;
	}
</script>

<Page pageTitle={m.accounts_title()}>
	{#snippet actions()}
		<Link href={resolve('/settings/connections')} class="text-sm">
			{m.accounts_linked_institutions_link()}
		</Link>
		<Link href={resolve('/accounts/add')} class="text-sm">{m.accounts_add_page_title()}</Link>
	{/snippet}
	<Section>
		<Tabs.Root bind:value={filter}>
			<SectionTitle title={m.accounts_section_title()}>
				<Tabs.List>
					{#each filters as option (option.key)}
						<Tabs.Trigger value={option.key}>{option.label}</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</SectionTitle>

			{#if !isLoaded}
				<Skeleton class="h-64" showSpinner />
			{:else}
				{#each filters as option (option.key)}
					<Tabs.Content value={option.key} class="flex flex-col space-y-2">
						{@const rowsForOption = rowsByFilter.get(option.key) ?? []}
						{@const total = totalsByFilter.get(option.key) ?? {
							value: null,
							isPartial: false
						}}
						<div class="grid grid-cols-1 gap-2 max-sm:mt-1.5 max-sm:mb-4 sm:grid-cols-2">
							<KeyValue
								title={m.accounts_summary_count_label()}
								value={rowsForOption.length}
								variant="outline"
								format="number"
							/>
							<KeyValue
								title={m.summary_net_balance()}
								value={total.value}
								variant="outline"
								decimalScale={2}
								isPartial={total.isPartial}
							/>
						</div>
						{#if rowsForOption.length === 0}
							<Empty>
								{option.empty}
							</Empty>
						{:else}
							<div class="full-bleed bg-background overflow-hidden rounded-sm shadow-md">
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
												{m.accounts_table_header_account()}
											</Table.SortableHead>
											<Table.SortableHead
												class="text-left whitespace-nowrap"
												column="institution"
												sortColumn={sort.column}
												sortDirection={sort.direction}
												onSort={sort.toggle}
											>
												{m.accounts_table_header_institution()}
											</Table.SortableHead>
											<Table.Head class="text-left whitespace-nowrap">
												{m.accounts_table_header_group()}
											</Table.Head>
											<Table.Head class="text-left whitespace-nowrap">
												{m.accounts_table_header_type()}
											</Table.Head>
											<Table.Head class="text-left whitespace-nowrap">
												{m.accounts_table_header_status()}
											</Table.Head>
											<Table.SortableHead
												class="text-right whitespace-nowrap"
												column="transactions"
												sortColumn={sort.column}
												sortDirection={sort.direction}
												onSort={sort.toggle}
											>
												{m.accounts_table_header_transactions()}
											</Table.SortableHead>
											<Table.SortableHead
												class="text-right whitespace-nowrap"
												column="balance"
												sortColumn={sort.column}
												sortDirection={sort.direction}
												onSort={sort.toggle}
											>
												{m.accounts_table_header_balance()}
											</Table.SortableHead>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each rowsForOption as row (row.id)}
											<Table.Row class={row.participantExcluded || row.closed ? 'bg-muted/30' : ''}>
												<Table.Cell>
													<RecordLink
														type="account"
														id={row.id}
														name={row.name}
														isShared={row.isShared}
														class="cell-truncate text-foreground/90 text-sm font-medium"
													/>
												</Table.Cell>
												<Table.Cell class="text-foreground/80 text-sm">
													{#if row.institution}
														<span class="cell-truncate" title={row.institution}
															>{row.institution}</span
														>
													{:else}
														<span class="text-muted-foreground">~</span>
													{/if}
												</Table.Cell>
												<Table.Cell>
													<Badge variant={groupMeta[row.balanceGroup].badge}>
														{groupMeta[row.balanceGroup].label}
													</Badge>
												</Table.Cell>
												<Table.Cell>
													<div class="text-foreground/80 text-sm">{row.typeName}</div>
												</Table.Cell>
												<Table.Cell>
													{@const statuses = statusBadges(row)}
													{#if statuses.length === 0 && !row.isLinked}
														<span class="text-muted-foreground">~</span>
													{:else}
														<div class="flex flex-wrap gap-2">
															{#each statuses as status (status.id)}
																<Tooltip.Root>
																	<Tooltip.Trigger class="inline-flex">
																		<Badge
																			variant="outline"
																			class="border-border/60 text-foreground/70 text-xs font-normal"
																		>
																			{status.label}
																		</Badge>
																	</Tooltip.Trigger>
																	<Tooltip.Content sideOffset={6}>
																		<p class="text-xs leading-snug font-normal">
																			{status.description}
																		</p>
																	</Tooltip.Content>
																</Tooltip.Root>
															{/each}
															{#if row.needsReauth}
																<Badge variant="warning" href={resolve('/settings/connections')}>
																	{m.accounts_status_reauth_label()}
																</Badge>
															{:else if row.isLinked}
																<Badge variant="outline" href={resolve('/settings/connections')}>
																	{m.accounts_status_linked_label()}
																</Badge>
															{/if}
														</div>
													{/if}
												</Table.Cell>
												<Table.Cell class="text-right tabular-nums">
													{@const txnCount = transactionsCounts.get(row.id)}
													{#if txnCount !== undefined}
														<span class="font-mono">{txnCount}</span>
													{:else if row.autoCalculated}
														<span class="font-mono">0</span>
													{:else}
														<span class="text-muted-foreground font-mono">~</span>
													{/if}
												</Table.Cell>
												<Table.Cell class="text-right tabular-nums">
													{#if row.balance === null}
														<span class="text-muted-foreground">~</span>
													{:else if row.participantExcluded || row.closed}
														<Tooltip.Root>
															<Tooltip.Trigger
																class="border-border inline-block border-b border-dashed hover:border-current"
															>
																<Currency
																	value={row.balance}
																	decimalScale={2}
																	sentiment={balanceSentiment(row)}
																	isConverted={row.isConverted}
																	isUnconverted={row.isUnconverted}
																	missingCurrency={row.missingCurrency}
																	nativeCurrency={row.nativeBalance === null
																		? undefined
																		: row.nativeCurrency}
																	nativeValue={row.nativeBalance ?? undefined}
																	showFxTooltip={false}
																/>
															</Tooltip.Trigger>
															<Tooltip.Content sideOffset={6}>
																<p class="text-xs leading-snug font-normal">
																	{row.closed
																		? m.accounts_balance_tooltip_closed()
																		: m.accounts_balance_tooltip_excluded()}
																</p>
																{#if row.isConverted || row.isUnconverted}
																	<p class="text-xs leading-snug font-normal">
																		{getCurrencyFxLabel({
																			decimalScale: 2,
																			isUnconverted: row.isUnconverted,
																			missingCurrency: row.missingCurrency,
																			nativeCurrency:
																				row.nativeBalance === null ? undefined : row.nativeCurrency,
																			nativeValue: row.nativeBalance ?? undefined
																		})}
																	</p>
																{/if}
															</Tooltip.Content>
														</Tooltip.Root>
													{:else}
														<Currency
															value={row.balance}
															decimalScale={2}
															sentiment={balanceSentiment(row)}
															isConverted={row.isConverted}
															isUnconverted={row.isUnconverted}
															missingCurrency={row.missingCurrency}
															nativeCurrency={row.nativeBalance === null
																? undefined
																: row.nativeCurrency}
															nativeValue={row.nativeBalance ?? undefined}
														/>
													{/if}
												</Table.Cell>
											</Table.Row>
										{/each}
									</Table.Body>
								</Table.Root>
							</div>
						{/if}
					</Tabs.Content>
				{/each}
			{/if}
		</Tabs.Root>
	</Section>
</Page>
