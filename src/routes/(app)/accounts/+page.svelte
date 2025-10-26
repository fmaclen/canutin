<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { m } from '$lib/paraglide/messages';
	import type { TransactionsResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

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
		balance: number;
		typeName: string;
		balanceGroup: BalanceGroup;
		autoCalculated: boolean;
		excluded: boolean;
		closed: boolean;
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

	const allRows = $derived.by(() =>
		accountsContext.accounts
			.map((account) => ({
				id: account.id,
				name: account.name,
				institution: account.institution ?? null,
				balance: account.balance ?? 0,
				typeName: accountsContext.getTypeName(account.balanceType),
				balanceGroup: account.balanceGroup as BalanceGroup,
				autoCalculated: Boolean(account.autoCalculated),
				excluded: Boolean(account.excluded),
				closed: Boolean(account.closed)
			}))
			.sort((a, b) => {
				if (b.balance !== a.balance) return b.balance - a.balance;
				return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
			})
	);

	const rowsByFilter = $derived.by(() => {
		const map = new SvelteMap<FilterOption, AccountRow[]>();
		for (const option of filters)
			map.set(
				option.key,
				allRows.filter((row) => option.predicate(row))
			);
		return map;
	});

	const totalsByFilter = $derived.by(() => {
		const totals = new SvelteMap<FilterOption, number>();
		for (const option of filters) {
			const rows = rowsByFilter.get(option.key) ?? [];
			const total = rows.reduce(
				(sum, row) => sum + (option.key === 'open' && row.excluded ? 0 : row.balance),
				0
			);
			totals.set(option.key, total);
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

	$effect(() => {
		void refreshTransactionsTotals();
	});

	const isLoaded = $derived(() => accountsContext.lastBalanceEvent !== 0);

	function balanceSentiment(row: AccountRow) {
		if (row.closed || row.excluded) return 'neutral';
		if (row.balance === 0) return 'neutral';
		if (row.balanceGroup === 'DEBT') return 'negative';
		return 'positive';
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
		if (row.excluded) statuses.push({ id: 'excluded', ...statusMeta.excluded });
		if (row.closed) statuses.push({ id: 'closed', ...statusMeta.closed });
		return statuses;
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_accounts()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle="Accounts">
	<Section>
		{#if !isLoaded}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64 w-full" />
			</div>
		{:else}
			<Tabs.Root bind:value={filter}>
				<nav class="flex items-center justify-between space-x-2">
					<SectionTitle title={m.accounts_section_title()} />
					<Tabs.List>
						{#each filters as option (option.key)}
							<Tabs.Trigger value={option.key}>{option.label}</Tabs.Trigger>
						{/each}
					</Tabs.List>
				</nav>

				{#each filters as option (option.key)}
					<Tabs.Content value={option.key}>
						{@const rowsForOption = rowsByFilter.get(option.key) ?? []}
						{#if rowsForOption.length === 0}
							<div
								class="text-muted-foreground bg-muted/40 flex min-h-40 items-center justify-center rounded-sm border border-dashed"
							>
								{option.empty}
							</div>
						{:else}
							<div class="bg-background overflow-hidden rounded-sm shadow-md">
								<Table.Root>
									<Table.Header>
										<Table.Row>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.accounts_table_header_account()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.accounts_table_header_institution()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.accounts_table_header_group()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.accounts_table_header_type()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.accounts_table_header_status()}</Table.Head
											>
											<Table.Head class="text-right whitespace-nowrap"
												>{m.accounts_table_header_transactions()}</Table.Head
											>
											<Table.Head class="text-right whitespace-nowrap"
												>{m.accounts_table_header_balance()}</Table.Head
											>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each rowsForOption as row (row.id)}
											<Table.Row class={row.excluded || row.closed ? 'bg-muted/30' : ''}>
												<Table.Cell>
													<span class="text-foreground/90 text-sm font-medium">{row.name}</span>
												</Table.Cell>
												<Table.Cell class="text-foreground/80 text-sm">
													{#if row.institution}
														{row.institution}
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
													<div class="flex flex-wrap gap-2">
														{#if statuses.length}
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
														{:else}
															<span class="text-muted-foreground text-xs">~</span>
														{/if}
													</div>
												</Table.Cell>
												<Table.Cell class="font-jetbrains-mono text-right text-xs tabular-nums">
													{@const txnCount = transactionsCounts.get(row.id)}
													{@const hasTxn = transactionsCounts.has(row.id)}
													{#if hasTxn}
														<span>{txnCount}</span>
													{:else}
														<span class="text-muted-foreground">~</span>
													{/if}
												</Table.Cell>
												<Table.Cell class="text-right text-xs tabular-nums">
													{#if row.excluded || row.closed}
														<Tooltip.Root>
															<Tooltip.Trigger
																class="border-border inline-block border-b border-dashed hover:border-current"
															>
																<Currency
																	value={row.balance}
																	maximumFractionDigits={2}
																	sentiment={balanceSentiment(row)}
																/>
															</Tooltip.Trigger>
															<Tooltip.Content sideOffset={6}>
																<p class="text-xs leading-snug font-normal">
																	{row.closed
																		? m.accounts_balance_tooltip_closed()
																		: m.accounts_balance_tooltip_excluded()}
																</p>
															</Tooltip.Content>
														</Tooltip.Root>
													{:else}
														<Currency
															value={row.balance}
															maximumFractionDigits={2}
															sentiment={balanceSentiment(row)}
														/>
													{/if}
												</Table.Cell>
											</Table.Row>
										{/each}
									</Table.Body>
									<Table.Footer>
										<Table.Row class="bg-background sticky bottom-0 border-t-2">
											<Table.Cell colspan={6} class="text-muted-foreground text-xs font-normal">
												{m.accounts_aggregate_total_label()}
											</Table.Cell>
											<Table.Cell class="text-foreground text-right text-xs tabular-nums">
												{@const total = totalsByFilter.get(option.key) ?? 0}
												<Currency
													value={total}
													maximumFractionDigits={2}
													sentiment={total > 0 ? 'positive' : total < 0 ? 'negative' : 'neutral'}
												/>
											</Table.Cell>
										</Table.Row>
									</Table.Footer>
								</Table.Root>
							</div>
						{/if}
					</Tabs.Content>
				{/each}
			</Tabs.Root>
		{/if}
	</Section>
</Page>
