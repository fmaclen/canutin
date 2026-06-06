<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
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
	const investmentAccounts = $derived(
		accountsContext.accounts.filter(
			(account) => account.balanceGroup === 'INVESTMENT' && !account.closed
		)
	);

	let securities = $state<SecuritiesResponse[]>([]);
	let holdings = $state<HoldingsResponse[]>([]);
	let isLoaded = $state(false);
	let securityName = $state('');
	let securitySymbol = $state('');
	let selectedSecurity = $state('');
	let selectedAccount = $state('');
	let quantityInput = $state('');
	let marketPriceInput = $state('');

	const securitiesById = $derived(new Map(securities.map((security) => [security.id, security])));
	const accountsById = $derived(
		new Map(investmentAccounts.map((account) => [account.id, account]))
	);
	const totalMarketValue = $derived(
		holdings.reduce((sum, holding) => sum + holding.quantity * holding.marketPrice, 0)
	);

	async function refreshInvestments() {
		try {
			securities = await pb.authedClient.collection('securities').getFullList({
				sort: 'name',
				requestKey: null
			});
			holdings = await pb.authedClient.collection('holdings').getFullList({
				requestKey: null
			});
		} catch (error) {
			pb.handleConnectionError(error, 'investments', 'refresh');
		} finally {
			isLoaded = true;
		}
	}

	async function handleCreateSecurity() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;

		try {
			const security = await pb.authedClient.collection('securities').create({
				owner: currentOwnerId,
				name: securityName.trim(),
				symbol: securitySymbol.trim().toUpperCase() || undefined
			});
			securityName = '';
			securitySymbol = '';
			selectedSecurity = security.id;
			await refreshInvestments();
			toast.success(m.investments_security_added());
		} catch (error) {
			console.error('[investmentsCreateSecurity]', error);
			toast.error(m.investments_security_add_failed());
		}
	}

	async function handleAddHolding() {
		const currentOwnerId = ownerId;
		const quantity = Number.parseFloat(quantityInput);
		const marketPrice = Number.parseFloat(marketPriceInput);
		if (
			!currentOwnerId ||
			!selectedSecurity ||
			Number.isNaN(quantity) ||
			Number.isNaN(marketPrice)
		) {
			return;
		}

		try {
			await pb.authedClient.collection('holdings').create({
				owner: currentOwnerId,
				security: selectedSecurity,
				account: selectedAccount || undefined,
				quantity,
				marketPrice
			});
			quantityInput = '';
			marketPriceInput = '';
			await refreshInvestments();
			toast.success(m.investments_holding_added());
		} catch (error) {
			console.error('[investmentsAddHolding]', error);
			toast.error(m.investments_holding_add_failed());
		}
	}

	$effect(() => {
		if (ownerId) void refreshInvestments();
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_investments()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.investments_page_title()}>
	<Section>
		<div class="grid gap-4 lg:grid-cols-2">
			<div>
				<SectionTitle title={m.investments_security_section_title()} />
				<div class="bg-muted border-border overflow-hidden rounded border">
					<form
						onsubmit={(event) => {
							event.preventDefault();
							handleCreateSecurity();
						}}
					>
						<Fieldset isFirst={true}>
							<FormFieldRow>
								<Label for="security-name" class="justify-start pr-0 md:justify-end">
									{m.investments_label_security_name()}
								</Label>
								<Input id="security-name" bind:value={securityName} required />
							</FormFieldRow>

							<FormFieldRow>
								<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
									<Label for="security-symbol" class="justify-start pr-0 md:justify-end">
										{m.investments_label_ticker_symbol()}
									</Label>
									<span class="text-muted-foreground text-sm">{m.investments_text_optional()}</span>
								</div>
								<Input id="security-symbol" bind:value={securitySymbol} />
							</FormFieldRow>
						</Fieldset>

						<footer class="border-border bg-border border-t p-2">
							<div class="flex justify-end">
								<Button type="submit">{m.investments_button_create_security()}</Button>
							</div>
						</footer>
					</form>
				</div>
			</div>

			<div>
				<SectionTitle title={m.investments_holding_section_title()} />
				<div class="bg-muted border-border overflow-hidden rounded border">
					<form
						onsubmit={(event) => {
							event.preventDefault();
							handleAddHolding();
						}}
					>
						<Fieldset isFirst={true}>
							<FormFieldRow>
								<Label for="holding-security" class="justify-start pr-0 md:justify-end">
									{m.investments_label_security()}
								</Label>
								<select
									id="holding-security"
									bind:value={selectedSecurity}
									required
									class="border-input bg-background ring-offset-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded border px-2 py-1 shadow-xs outline-none focus-visible:ring-[3px]"
								>
									<option value="">{m.investments_security_select_placeholder()}</option>
									{#each securities as security (security.id)}
										<option value={security.id}>
											{security.symbol ? `${security.name} (${security.symbol})` : security.name}
										</option>
									{/each}
								</select>
							</FormFieldRow>

							<FormFieldRow>
								<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
									<Label for="holding-account" class="justify-start pr-0 md:justify-end">
										{m.investments_label_account()}
									</Label>
									<span class="text-muted-foreground text-sm">{m.investments_text_optional()}</span>
								</div>
								<select
									id="holding-account"
									bind:value={selectedAccount}
									class="border-input bg-background ring-offset-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded border px-2 py-1 shadow-xs outline-none focus-visible:ring-[3px]"
								>
									<option value="">{m.investments_account_select_placeholder()}</option>
									{#each investmentAccounts as account (account.id)}
										<option value={account.id}>{account.name}</option>
									{/each}
								</select>
							</FormFieldRow>

							<FormFieldRow>
								<Label for="holding-quantity" class="justify-start pr-0 md:justify-end">
									{m.investments_label_quantity()}
								</Label>
								<CurrencyField
									id="holding-quantity"
									name="holding-quantity"
									bind:value={quantityInput}
									required
									isCurrency={false}
								/>
							</FormFieldRow>

							<FormFieldRow>
								<Label for="holding-market-price" class="justify-start pr-0 md:justify-end">
									{m.investments_label_market_price()}
								</Label>
								<CurrencyField
									id="holding-market-price"
									name="holding-market-price"
									bind:value={marketPriceInput}
									required
								/>
							</FormFieldRow>
						</Fieldset>

						<footer class="border-border bg-border border-t p-2">
							<div class="flex justify-end">
								<Button type="submit">{m.investments_button_add_holding()}</Button>
							</div>
						</footer>
					</form>
				</div>
			</div>
		</div>
	</Section>

	<Section>
		<SectionTitle title={m.investments_holdings_table_title()} />
		{#if !isLoaded || holdings.length === 0}
			<Empty>{m.investments_holdings_empty()}</Empty>
		{:else}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="text-left whitespace-nowrap">
								{m.investments_table_header_security()}
							</Table.Head>
							<Table.Head class="text-left whitespace-nowrap">
								{m.investments_table_header_account()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.investments_table_header_quantity()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.investments_table_header_market_price()}
							</Table.Head>
							<Table.Head class="text-right whitespace-nowrap">
								{m.investments_table_header_market_value()}
							</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each holdings as holding (holding.id)}
							{@const security = securitiesById.get(holding.security)}
							<Table.Row>
								<Table.Cell>
									<div class="text-foreground/90 text-sm font-medium">
										{security ? security.name : m.investments_unknown_security()}
									</div>
									{#if security?.symbol}
										<div class="text-muted-foreground text-xs tracking-wide uppercase">
											{security.symbol}
										</div>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-sm">
									{accountsById.get(holding.account)?.name ?? m.investments_standalone_account()}
								</Table.Cell>
								<Table.Cell class="text-right font-mono text-sm tabular-nums">
									{holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									<Currency value={holding.marketPrice} decimalScale={2} sentiment="neutral" />
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									<Currency
										value={holding.quantity * holding.marketPrice}
										decimalScale={2}
										sentiment="positive"
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
					<Table.Footer>
						<Table.Row class="border-t-2">
							<Table.Cell colspan={4} class="text-muted-foreground text-xs font-normal">
								{m.investments_total_market_value_label()}
							</Table.Cell>
							<Table.Cell class="text-foreground text-right tabular-nums">
								<Currency value={totalMarketValue} decimalScale={2} sentiment="positive" />
							</Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
			</div>
		{/if}
	</Section>
</Page>
