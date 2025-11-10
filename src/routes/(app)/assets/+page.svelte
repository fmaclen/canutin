<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import Number from '$lib/components/number.svelte';
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

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	const assetsContext = getAssetsContext();

	const groupMeta: Record<
		BalanceGroup,
		{ label: string; badge: 'cash' | 'debt' | 'investment' | 'other' }
	> = {
		CASH: { label: m.assets_group_cash_label(), badge: 'cash' },
		DEBT: { label: m.assets_group_debt_label(), badge: 'debt' },
		INVESTMENT: { label: m.assets_group_investment_label(), badge: 'investment' },
		OTHER: { label: m.assets_group_other_label(), badge: 'other' }
	};

	type FilterOption = 'all' | 'owned' | 'sold';

	type AssetRow = {
		id: string;
		name: string;
		symbol: string | null;
		bookValue: number;
		marketValue: number;
		typeName: string;
		balanceGroup: BalanceGroup;
		excluded: boolean;
		sold: boolean;
		gain: number;
		gainPercent: number;
	};

	const filters: Array<{
		key: FilterOption;
		label: string;
		empty: string;
		predicate: (row: AssetRow) => boolean;
	}> = [
		{
			key: 'all',
			label: m.assets_filter_all_label(),
			empty: m.assets_filter_all_empty(),
			predicate: () => true
		},
		{
			key: 'owned',
			label: m.assets_filter_owned_label(),
			empty: m.assets_filter_owned_empty(),
			predicate: (row) => !row.sold
		},
		{
			key: 'sold',
			label: m.assets_filter_sold_label(),
			empty: m.assets_filter_sold_empty(),
			predicate: (row) => row.sold
		}
	];

	let filter: FilterOption = $state('owned');

	const allRows = $derived.by(() =>
		assetsContext.assets
			.map((asset) => ({
				id: asset.id,
				name: asset.name,
				symbol: asset.symbol ?? null,
				bookValue: asset.bookValue ?? 0,
				marketValue: asset.marketValue ?? 0,
				typeName: assetsContext.getTypeName(asset.balanceType),
				balanceGroup: asset.balanceGroup as BalanceGroup,
				excluded: Boolean(asset.excluded),
				sold: Boolean(asset.sold),
				gain: asset.gain ?? 0,
				gainPercent: asset.gainPercent ?? 0
			}))
			.sort((a, b) => {
				if (b.marketValue !== a.marketValue) return b.marketValue - a.marketValue;
				return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
			})
	);

	const rowsByFilter = $derived.by(() => {
		const map = new SvelteMap<FilterOption, AssetRow[]>();
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
				(sum, row) => sum + (option.key === 'owned' && row.excluded ? 0 : row.marketValue),
				0
			);
			totals.set(option.key, total);
		}
		return totals;
	});

	const isLoaded = $derived(() => assetsContext.lastBalanceEvent !== 0);

	function balanceSentiment(row: AssetRow) {
		if (row.sold || row.excluded) return 'neutral';
		if (row.marketValue === 0) return 'neutral';
		if (row.balanceGroup === 'DEBT') return 'negative';
		return 'positive';
	}

	const statusMeta = {
		excluded: {
			label: m.assets_status_excluded_label(),
			description: m.assets_status_excluded_description()
		},
		sold: {
			label: m.assets_status_sold_label(),
			description: m.assets_status_sold_description()
		}
	} satisfies Record<'excluded' | 'sold', { label: string; description: string }>;

	type StatusBadgeId = keyof typeof statusMeta;
	type StatusBadge = { id: StatusBadgeId; label: string; description: string };

	function statusBadges(row: AssetRow) {
		const statuses: StatusBadge[] = [];
		if (row.excluded) statuses.push({ id: 'excluded', ...statusMeta.excluded });
		if (row.sold) statuses.push({ id: 'sold', ...statusMeta.sold });
		return statuses;
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_assets()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="px-2">
		<Link href="/assets/add" class="text-sm">Add asset</Link>
	</nav>
</header>

<Page pageTitle="Assets">
	<Section>
		{#if !isLoaded}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64" />
			</div>
		{:else}
			<Tabs.Root bind:value={filter}>
				<nav class="flex items-center justify-between space-x-2">
					<SectionTitle title={m.assets_section_title()} />
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
							<Empty>
								{option.empty}
							</Empty>
						{:else}
							<div class="bg-background overflow-hidden rounded-sm shadow-md">
								<Table.Root>
									<Table.Header>
										<Table.Row>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.assets_table_header_asset()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.assets_table_header_symbol()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.assets_table_header_group()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.assets_table_header_category()}</Table.Head
											>
											<Table.Head class="text-left whitespace-nowrap"
												>{m.assets_table_header_status()}</Table.Head
											>
											<Table.Head class="text-right whitespace-nowrap"
												>{m.assets_table_header_book_value()}</Table.Head
											>
											<Table.Head class="text-right whitespace-nowrap"
												>{m.assets_table_header_gain_loss()}</Table.Head
											>
											<Table.Head class="text-right whitespace-nowrap"
												>{m.assets_table_header_gain_percent()}</Table.Head
											>
											<Table.Head class="text-right whitespace-nowrap"
												>{m.assets_table_header_market_value()}</Table.Head
											>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each rowsForOption as row (row.id)}
											<Table.Row class={row.excluded || row.sold ? 'bg-muted/30' : ''}>
												<Table.Cell>
													<Link
														href={`/assets/${row.id}`}
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
												<Table.Cell class="text-muted-foreground text-right text-xs tabular-nums">
													<Currency
														value={row.bookValue}
														maximumFractionDigits={2}
														sentiment="neutral"
													/>
												</Table.Cell>
												<Table.Cell class="text-right text-xs tabular-nums">
													<Currency
														value={row.gain}
														maximumFractionDigits={2}
														sentiment={row.gain > 0
															? 'positive'
															: row.gain < 0
																? 'negative'
																: 'neutral'}
													/>
												</Table.Cell>
												<Table.Cell class="text-right text-xs tabular-nums">
													<Number
														value={`${row.gainPercent > 0 ? '+' : ''}${row.gainPercent.toFixed(1)}%`}
														sentiment={row.gainPercent > 0
															? 'positive'
															: row.gainPercent < 0
																? 'negative'
																: 'neutral'}
													/>
												</Table.Cell>
												<Table.Cell class="text-right text-xs tabular-nums">
													{#if row.excluded || row.sold}
														<Tooltip.Root>
															<Tooltip.Trigger
																class="border-border inline-block border-b border-dashed hover:border-current"
															>
																<Currency
																	value={row.marketValue}
																	maximumFractionDigits={2}
																	sentiment={balanceSentiment(row)}
																/>
															</Tooltip.Trigger>
															<Tooltip.Content sideOffset={6}>
																<p class="text-xs leading-snug font-normal">
																	{row.sold
																		? m.assets_balance_tooltip_sold()
																		: m.assets_balance_tooltip_excluded()}
																</p>
															</Tooltip.Content>
														</Tooltip.Root>
													{:else}
														<Currency
															value={row.marketValue}
															maximumFractionDigits={2}
															sentiment={balanceSentiment(row)}
														/>
													{/if}
												</Table.Cell>
											</Table.Row>
										{/each}
									</Table.Body>
									<Table.Footer>
										<Table.Row
											class="[&>td]:!bg-muted [&>td]:hover:!bg-muted sticky bottom-0 border-t-2"
										>
											<Table.Cell colspan={5} class="text-muted-foreground text-xs font-normal">
												{m.assets_aggregate_total_label()}
											</Table.Cell>
											<Table.Cell></Table.Cell>
											<Table.Cell></Table.Cell>
											<Table.Cell></Table.Cell>
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
