<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import Number from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import type { HoldingsResponse, SecuritiesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();

	const ownerId = $derived(auth.currentUser?.record?.id);

	let securities = $state<SecuritiesResponse[]>([]);
	let holdings = $state<HoldingsResponse[]>([]);
	let isLoaded = $state(false);

	const securitiesById = $derived(new Map(securities.map((security) => [security.id, security])));
	const accountsById = $derived(
		new Map(accountsContext.accounts.map((account) => [account.id, account]))
	);
	const totalMarketValue = $derived(
		holdings.reduce((sum, holding) => sum + holding.quantity * holding.marketPrice, 0)
	);

	async function refreshHoldings() {
		try {
			securities = await pb.authedClient.collection('securities').getFullList({
				sort: 'name',
				requestKey: null
			});
			holdings = await pb.authedClient.collection('holdings').getFullList({
				requestKey: null
			});
		} catch (error) {
			pb.handleConnectionError(error, 'holdings', 'refresh');
		} finally {
			isLoaded = true;
		}
	}

	$effect(() => {
		if (ownerId) void refreshHoldings();
	});

	function valueSentiment(value: number) {
		if (value > 0) return 'positive';
		if (value < 0) return 'negative';
		return 'neutral';
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_holdings()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="px-4">
		<Link href="/holdings/add" class="text-sm">{m.holdings_add_link()}</Link>
	</nav>
</header>

<Page pageTitle={m.holdings_page_title()}>
	<Section>
		<SectionTitle title={m.holdings_section_title()} />
		{#if !isLoaded || holdings.length === 0}
			<Empty>{m.holdings_empty()}</Empty>
		{:else}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="text-left whitespace-nowrap">
								{m.holdings_table_header_security()}
							</Table.Head>
							<Table.Head class="text-left whitespace-nowrap">
								{m.holdings_table_header_symbol()}
							</Table.Head>
							<Table.Head class="text-left whitespace-nowrap">
								{m.holdings_table_header_account()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.holdings_table_header_quantity()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.holdings_table_header_market_price()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.holdings_table_header_market_value()}
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each holdings as holding (holding.id)}
							{@const security = securitiesById.get(holding.security)}
							{@const account = accountsById.get(holding.account)}
							{@const marketValue = holding.quantity * holding.marketPrice}
							<Table.Row>
								<Table.Cell>
									<span class="text-foreground/90 text-sm font-medium">
										{security ? security.name : m.holdings_unknown_security()}
									</span>
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-sm tracking-wide uppercase">
									{#if security?.symbol}
										{security.symbol}
									{:else}
										<span class="text-muted-foreground">~</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-sm">
									{#if account}
										<RecordLink
											type="account"
											id={account.id}
											name={account.name}
											isShared={account.isShared}
											class="text-foreground/90 text-sm font-medium"
										/>
									{:else}
										{m.holdings_unknown_account()}
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									<Number
										value={holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}
									/>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									<Currency value={holding.marketPrice} decimalScale={2} sentiment="neutral" />
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									<Currency
										value={marketValue}
										decimalScale={2}
										sentiment={valueSentiment(marketValue)}
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
					<Table.Footer>
						<Table.Row class="border-t-2">
							<Table.Cell colspan={3} class="text-muted-foreground text-xs font-normal">
								{m.holdings_total_market_value_label()}
							</Table.Cell>
							<Table.Cell></Table.Cell>
							<Table.Cell></Table.Cell>
							<Table.Cell class="text-foreground text-right tabular-nums">
								<Currency
									value={totalMarketValue}
									decimalScale={2}
									sentiment={valueSentiment(totalMarketValue)}
								/>
							</Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
			</div>
		{/if}
	</Section>
</Page>
