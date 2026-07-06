<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	import BalanceFields from '../balance-fields.svelte';
	import { createSecurityBalanceFormData, toSecurityBalanceInput } from '../balance-form';

	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	const currenciesContext = getCurrenciesContext();

	let name = $state('');
	let symbol = $state('');
	let balanceFormData = $state(createSecurityBalanceFormData());
	let manualCurrency = $state<string | null>(null);
	let isSaving = $state(false);

	const ownerId = $derived(auth.currentUser?.record?.id);
	const eligibleAccounts = $derived(
		accountsContext.accounts.filter((account) => !account.closed && account.canWrite)
	);
	const selectedAccountCurrency = $derived(
		eligibleAccounts.find((account) => account.id === balanceFormData.accountId)?.currency
	);
	const currency = $derived(
		manualCurrency ?? selectedAccountCurrency ?? interfacePreferences.displayCurrency
	);
	const currencyOptions = $derived(currenciesContext.currencyOptions);
	const selectedCurrency = $derived(currenciesContext.getCurrency(currency));
	const canSubmit = $derived(
		Boolean(
			name.trim() &&
				currenciesContext.hasCurrency(currency) &&
				balanceFormData.accountId &&
				balanceFormData.asOf &&
				balanceFormData.quantity &&
				balanceFormData.price
		)
	);

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || isSaving || !canSubmit) return;

		try {
			isSaving = true;
			await securitiesContext.createSecurityWithBalance(
				{
					name: name.trim(),
					symbol: symbol.trim() || undefined,
					owner: currentOwnerId,
					currency
				},
				toSecurityBalanceInput(balanceFormData, currentOwnerId)
			);
			toast.success(m.securities_add_success());
			await goto(resolve('/securities'));
		} catch (error) {
			logError('securitiesAdd', 'create', error);
			toast.error(m.securities_add_failed());
		} finally {
			isSaving = false;
		}
	}
</script>

<Page
	pageTitle={m.securities_add_page_title()}
	crumbs={[
		{ label: m.securities_title(), href: resolve('/securities') },
		{ label: m.securities_add_page_title() }
	]}
>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			handleSubmit();
		}}
		class="flex w-full flex-col space-y-8"
	>
		<Section>
			<SectionTitle title={m.securities_section_details()} />
			<div class="bg-muted border-border overflow-hidden rounded border">
				<Fieldset isFirst={true}>
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
							<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
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
				</Fieldset>
			</div>
		</Section>

		<Section>
			<SectionTitle title={m.securities_section_balance()} />
			<div class="bg-muted border-border overflow-hidden rounded border">
				<BalanceFields
					formData={balanceFormData}
					accounts={eligibleAccounts}
					{currency}
					isFirst={true}
					disabled={isSaving}
				/>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={isSaving || !canSubmit}>
							{m.securities_button_add()}
						</Button>
					</div>
				</footer>
			</div>
		</Section>
	</form>
</Page>
