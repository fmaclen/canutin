<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';
	import type { SecuritiesResponse } from '$lib/pocketbase.schema';
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
	let selectedSecurity = $state('');
	let isAddingNewSecurity = $state(false);
	let securityName = $state('');
	let securitySymbol = $state('');
	let selectedAccount = $state('');
	let quantityInput = $state('');
	let marketPriceInput = $state('');

	async function refreshSecurities() {
		try {
			securities = await pb.authedClient.collection('securities').getFullList({
				sort: 'name',
				requestKey: null
			});
		} catch (error) {
			pb.handleConnectionError(error, 'holdings', 'refreshSecurities');
		}
	}

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		const quantity = Number.parseFloat(quantityInput);
		const marketPrice = Number.parseFloat(marketPriceInput);
		if (
			!currentOwnerId ||
			!selectedAccount ||
			Number.isNaN(quantity) ||
			Number.isNaN(marketPrice)
		) {
			toast.error(m.holdings_add_missing_required());
			return;
		}

		try {
			let securityId = selectedSecurity;
			if (isAddingNewSecurity) {
				const name = securityName.trim();
				const symbol = securitySymbol.trim().toUpperCase();
				const existingSecurity = securities.find(
					(security) =>
						(symbol && security.symbol?.toUpperCase() === symbol) ||
						security.name.trim().toLowerCase() === name.toLowerCase()
				);
				if (existingSecurity) {
					securityId = existingSecurity.id;
				} else {
					const security = await pb.authedClient.collection('securities').create({
						owner: currentOwnerId,
						name,
						symbol: symbol || undefined
					});
					securityId = security.id;
				}
			}
			if (!securityId) {
				toast.error(m.holdings_add_missing_required());
				return;
			}

			await pb.authedClient.collection('holdings').create({
				owner: currentOwnerId,
				security: securityId,
				account: selectedAccount,
				quantity,
				marketPrice
			});

			toast.success(m.holdings_add_success());
			await goto(resolve('/holdings'));
		} catch (error) {
			console.error('[holdingsAdd]', error);
			toast.error(m.holdings_add_failed());
		}
	}

	$effect(() => {
		if (ownerId) void refreshSecurities();
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/holdings">{m.sidebar_holdings()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.holdings_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.holdings_add_page_title()}>
	<Section>
		<SectionTitle title={m.holdings_section_details()} />
		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label
							id="security-label"
							for={isAddingNewSecurity ? 'security-name' : 'holding-security'}
							class="justify-start pr-0 md:justify-end"
						>
							{m.holdings_label_security()}
						</Label>
						{#if isAddingNewSecurity}
							<div class="grid gap-2 md:grid-cols-2">
								<Input
									id="security-name"
									aria-label={m.holdings_label_security_name()}
									bind:value={securityName}
									placeholder={m.holdings_label_security_name()}
									required
								/>
								<Input
									id="security-symbol"
									aria-label={m.holdings_label_ticker_symbol()}
									bind:value={securitySymbol}
									placeholder={m.holdings_label_ticker_symbol()}
								/>
							</div>
						{:else}
							<div class="flex gap-2">
								<Select.Root type="single" bind:value={selectedSecurity}>
									<Select.Trigger
										id="holding-security"
										aria-labelledby="security-label"
										class="bg-background w-full"
									>
										{#if selectedSecurity}
											{@const security = securities.find((item) => item.id === selectedSecurity)}
											{security?.symbol ? `${security.name} (${security.symbol})` : security?.name}
										{:else}
											<span class="text-muted-foreground"
												>{m.holdings_security_select_placeholder()}</span
											>
										{/if}
									</Select.Trigger>
									<Select.Content>
										{#each securities as security (security.id)}
											<Select.Item value={security.id}>
												{security.symbol ? `${security.name} (${security.symbol})` : security.name}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Button
									type="button"
									variant="outline"
									onclick={() => (isAddingNewSecurity = true)}
								>
									{m.holdings_button_add_new_security()}
								</Button>
							</div>
						{/if}
					</FormFieldRow>

					<FormFieldRow>
						<Label
							id="account-label"
							for="holding-account"
							class="justify-start pr-0 md:justify-end"
						>
							{m.holdings_label_account()}
						</Label>
						<Select.Root type="single" bind:value={selectedAccount}>
							<Select.Trigger
								id="holding-account"
								aria-labelledby="account-label"
								class="bg-background w-full"
							>
								{#if selectedAccount}
									{investmentAccounts.find((account) => account.id === selectedAccount)?.name}
								{:else}
									<span class="text-muted-foreground"
										>{m.holdings_account_select_placeholder()}</span
									>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#each investmentAccounts as account (account.id)}
									<Select.Item value={account.id}>{account.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="holding-quantity" class="justify-start pr-0 md:justify-end">
							{m.holdings_label_quantity()}
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
							{m.holdings_label_market_price()}
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
						<Button type="submit">{m.holdings_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
