<script lang="ts">
	import { resolve } from '$app/paths';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	const securitiesContext = getSecuritiesContext();

	const rows = $derived(securitiesContext.aggregateRows);

	function formatQuantity(value: number | null) {
		if (value === null) return '~';
		return new Intl.NumberFormat('en-US', {
			maximumFractionDigits: 8
		}).format(value);
	}

	function sentiment(value: number | null) {
		if (value === null || value === 0) return 'neutral';
		return value > 0 ? 'positive' : 'negative';
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_portfolio()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.portfolio_page_title()}>
	<Section>
		<SectionTitle title={m.portfolio_section_holdings()} />
		{#if securitiesContext.isLoading}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64" />
			</div>
		{:else if rows.length === 0}
			<Empty>{m.portfolio_empty()}</Empty>
		{:else}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_security()}
							</Table.Head>
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_symbol()}
							</Table.Head>
							<Table.Head class="text-left whitespace-nowrap">
								{m.securities_table_header_accounts()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.securities_table_header_quantity()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.securities_table_header_value()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.securities_table_header_cost_basis()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.securities_table_header_gain_loss()}
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rows as row (row.id)}
							<Table.Row>
								<Table.Cell>
									<Link
										href={resolve(`/trades/securities/${row.id}`)}
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
											<Link href={resolve(`/accounts/${account.id}`)}>
												{account.name}
											</Link>
										{/each}
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.quantity === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<NumberDisplay value={formatQuantity(row.quantity)} />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.value === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency value={row.value} decimalScale={2} />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.costBasis === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency value={row.costBasis} decimalScale={2} />
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
										/>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</Section>
</Page>
