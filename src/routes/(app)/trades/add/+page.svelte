<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox, type ComboboxItem } from '$lib/components/ui/combobox/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { SecurityTransactionsTypeOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { securityComboboxLabel, tradeTypeLabel } from '$lib/trade-display';
	import { toNumber } from '$lib/utils';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	const currenciesContext = getCurrenciesContext();
	const newSecurityValue = '__new_security__';

	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed && a.canWrite));
	const typeOptions = Object.values(SecurityTransactionsTypeOptions);

	let accountId = $state('');
	let securityId = $state('');
	let name = $state('');
	let symbol = $state('');
	let manualCurrency = $state<string | null>(null);
	let date = $state('');
	let type = $state<SecurityTransactionsTypeOptions>(SecurityTransactionsTypeOptions.buy);
	let subtype = $state('');
	let description = $state('');
	let quantity = $state('');
	let price = $state('');
	let amount = $state('');
	let fees = $state('');
	let notes = $state('');
	let isSaving = $state(false);

	const isNewSecurity = $derived(securityId === newSecurityValue);
	const selectedSecurity = $derived(
		securityId && !isNewSecurity
			? (securitiesContext.securities.find((security) => security.id === securityId) ?? null)
			: null
	);
	const selectedAccountCurrency = $derived(
		openAccounts.find((account) => account.id === accountId)?.currency
	);
	const currency = $derived(
		manualCurrency ?? selectedAccountCurrency ?? interfacePreferences.displayCurrency
	);
	const currencyOptions = $derived(currenciesContext.currencyOptions);
	const selectedCurrency = $derived(currenciesContext.getCurrency(currency));
	const tradeCurrency = $derived(isNewSecurity ? currency : selectedSecurity?.currency);
	const securityItems = $derived(
		securitiesContext.securities.map(
			(security): ComboboxItem => ({
				value: security.id,
				label: securityComboboxLabel(security),
				keywords: security.symbol ? [security.symbol] : undefined
			})
		)
	);
	const canSubmit = $derived(
		Boolean(
			accountId &&
				date &&
				description.trim() &&
				(isNewSecurity ? name.trim() && currenciesContext.hasCurrency(currency) : selectedSecurity)
		)
	);

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || isSaving || !canSubmit) return;

		try {
			isSaving = true;
			const security = isNewSecurity
				? await pb.authedClient.collection('securities').create({
						name: name.trim(),
						symbol: symbol.trim() || undefined,
						owner: currentOwnerId,
						currency
					})
				: selectedSecurity;
			if (!security) return;

			await pb.authedClient.collection('securityTransactions').create({
				account: accountId,
				security: security.id,
				owner: currentOwnerId,
				date: new Date(date + 'T12:00:00Z').toISOString(),
				type,
				subtype: subtype.trim() || undefined,
				description: description.trim(),
				quantity: toNumber(quantity),
				price: toNumber(price),
				amount: toNumber(amount),
				fees: toNumber(fees),
				notes: notes.trim() || undefined
			});

			toast.success(m.trades_add_success());
			await goto(resolve('/trades'));
		} catch (error) {
			logError('tradesAdd', 'create', error);
			toast.error(m.trades_add_failed());
		} finally {
			isSaving = false;
		}
	}
</script>

<Page
	pageTitle={m.trades_add_page_title()}
	crumbs={[
		{ label: m.trades_title(), href: resolve('/trades') },
		{ label: m.trades_add_page_title() }
	]}
>
	<Section>
		<SectionTitle title={m.transactions_section_details()} />

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
						<Label for="account" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_account()}
						</Label>
						<AccountPicker
							accounts={openAccounts}
							bind:value={accountId}
							id="account"
							placeholder={m.transactions_account_select_placeholder()}
							disabled={isSaving}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="date" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_date()}
						</Label>
						<Input id="date" type="date" bind:value={date} disabled={isSaving} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="security" class="justify-start pr-0 md:justify-end">
							{m.trades_label_security()}
						</Label>
						<Combobox
							id="security"
							ariaLabel={m.trades_label_security()}
							items={securityItems}
							bind:value={securityId}
							placeholder={m.trades_security_select_placeholder()}
							isLoading={securitiesContext.isLoading}
							emptyText={m.trades_securities_empty()}
							disabled={isSaving}
						>
							{#snippet triggerContent()}
								{#if isNewSecurity}
									{m.trades_security_select_add_option()}
								{:else if selectedSecurity}
									{securityComboboxLabel(selectedSecurity)}
								{:else}
									<span class="text-muted-foreground">
										{m.trades_security_select_placeholder()}
									</span>
								{/if}
							{/snippet}
							{#snippet pinned({ close })}
								<Command.Item
									value={newSecurityValue}
									onSelect={() => {
										securityId = newSecurityValue;
										close();
									}}
								>
									{m.trades_security_select_add_option()}
								</Command.Item>
							{/snippet}
						</Combobox>
					</FormFieldRow>

					{#if isNewSecurity}
						<FormFieldRow>
							<Label for="security-name" class="justify-start pr-0 md:justify-end">
								{m.securities_label_name()}
							</Label>
							<Input id="security-name" bind:value={name} disabled={isSaving} required />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="security-symbol" class="justify-start pr-0 md:justify-end">
									{m.securities_label_symbol()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Input id="security-symbol" bind:value={symbol} disabled={isSaving} />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="security-currency" class="justify-start pr-0 md:justify-end">
								{m.securities_label_currency()}
							</Label>
							<Select.Root
								type="single"
								value={currency}
								disabled={isSaving}
								onValueChange={(value) => (manualCurrency = value)}
							>
								<Select.Trigger id="security-currency" class="bg-background w-full">
									{#if selectedCurrency}
										<div class="flex min-w-0 items-center gap-2">
											<span>{selectedCurrency.code}</span>
											{#if selectedCurrency.name}
												<span class="text-muted-foreground truncate">{selectedCurrency.name}</span>
											{/if}
										</div>
									{:else if currency}
										{currency}
									{:else}
										<span class="text-muted-foreground">{m.currencies_select_placeholder()}</span>
									{/if}
								</Select.Trigger>
								<Select.Content>
									{#if currencyOptions.length === 0}
										<Select.Item value="__no-currencies" disabled>
											{m.currencies_select_empty()}
										</Select.Item>
									{:else}
										{#each currencyOptions as option (option.value)}
											<Select.Item value={option.value}>
												<div class="flex min-w-0 items-center gap-2">
													<span>{option.code}</span>
													{#if option.name}
														<span class="text-muted-foreground truncate">{option.name}</span>
													{/if}
												</div>
											</Select.Item>
										{/each}
									{/if}
								</Select.Content>
							</Select.Root>
						</FormFieldRow>
					{/if}

					<FormFieldRow>
						<Label for="description" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_description()}
						</Label>
						<Input id="description" bind:value={description} disabled={isSaving} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="type" class="justify-start pr-0 md:justify-end">
							{m.trades_label_type()}
						</Label>
						<Select.Root type="single" bind:value={type} disabled={isSaving}>
							<Select.Trigger id="type" class="bg-background w-full">
								{tradeTypeLabel(type)}
							</Select.Trigger>
							<Select.Content>
								{#each typeOptions as option (option)}
									<Select.Item value={option}>{tradeTypeLabel(option)}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="subtype" class="justify-start pr-0 md:justify-end">
								{m.trades_label_subtype()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<Input id="subtype" bind:value={subtype} disabled={isSaving} />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="quantity" class="justify-start pr-0 md:justify-end">
								{m.trades_label_quantity()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField
							id="quantity"
							name="quantity"
							bind:value={quantity}
							disabled={isSaving}
							isCurrency={false}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="price" class="justify-start pr-0 md:justify-end">
								{m.trades_label_price()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField
							id="price"
							name="price"
							bind:value={price}
							disabled={isSaving}
							currency={tradeCurrency}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="amount" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_amount()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField
							id="amount"
							name="amount"
							bind:value={amount}
							disabled={isSaving}
							currency={tradeCurrency}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="fees" class="justify-start pr-0 md:justify-end">
								{m.trades_label_fees()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField
							id="fees"
							name="fees"
							bind:value={fees}
							disabled={isSaving}
							currency={tradeCurrency}
						/>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2">
							<Label for="notes" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_notes()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<Textarea id="notes" bind:value={notes} class="bg-background" disabled={isSaving} />
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={isSaving || !canSubmit}
							>{m.transactions_button_add()}</Button
						>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
