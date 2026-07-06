<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();
	const currenciesContext = getCurrenciesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const currencyOptions = $derived(currenciesContext.currencyOptions);

	let name = $state('');
	let institution = $state('');
	let balanceGroup: AccountsBalanceGroupOptions | '' = $state('');
	let accountTypeName = $state('');
	let notes = $state('');
	let excluded = $state(false);
	let closed = $state(false);
	let currency = $state(interfacePreferences.displayCurrency);
	let currencyWasChanged = $state(false);
	let value = $state('');

	const selectedCurrency = $derived(currenciesContext.getCurrency(currency));

	$effect(() => {
		if (!currencyWasChanged) {
			currency = interfacePreferences.displayCurrency;
		}
	});

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;
		if (!currenciesContext.hasCurrency(currency)) {
			toast.error(m.currency_required());
			return;
		}

		try {
			const balanceTypeId = await balanceTypesContext.getOrCreate(accountTypeName, currentOwnerId);

			const accountData: Record<string, unknown> = {
				name: name.trim(),
				balanceGroup: balanceGroup as AccountsBalanceGroupOptions,
				balanceType: balanceTypeId,
				currency,
				owner: currentOwnerId,
				institution: institution.trim() || undefined,
				notes: notes.trim() || undefined,
				excluded: excluded ? new Date().toISOString() : undefined,
				closed: closed ? new Date().toISOString() : undefined
			};

			const account = await pb.authedClient.collection('accounts').create(accountData);

			const balanceData: Record<string, unknown> = {
				account: account.id,
				owner: currentOwnerId,
				asOf: new Date().toISOString(),
				value: value ? parseFloat(value) : undefined
			};

			await pb.authedClient.collection('accountBalances').create(balanceData);
			if (await accountsContext.refreshAccount(account.id, currentOwnerId)) {
				accountsContext.notifyBalancesChanged();
			}

			toast.success(m.accounts_add_success());
			await goto(resolve('/accounts'));
		} catch (error) {
			logError('addAccount', 'create', error);
			toast.error(m.accounts_add_failed());
		}
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/accounts">{m.sidebar_accounts()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.accounts_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.accounts_add_page_title()}>
	<Section>
		<SectionTitle title={m.accounts_section_details()} />
		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="name" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_name()}</Label
						>
						<Input id="name" bind:value={name} required />
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="institution" class="justify-start pr-0 md:justify-end"
								>{m.accounts_label_institution()}</Label
							>
							<span class="text-muted-foreground text-sm">{m.accounts_text_optional()}</span>
						</div>
						<Input id="institution" bind:value={institution} />
					</FormFieldRow>

					<FormFieldRow>
						<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_category()}</Label
						>
						<Input
							id="category"
							name="category"
							bind:value={accountTypeName}
							placeholder={m.accounts_category_placeholder()}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="balance-group" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_balance_group()}</Label
						>
						<Select.Root type="single" bind:value={balanceGroup}>
							<Select.Trigger id="balance-group" class="bg-background w-full">
								{#if balanceGroup}
									<div class="flex items-center gap-2">
										<div
											class="size-2 rounded-full {balanceGroup === AccountsBalanceGroupOptions.CASH
												? 'bg-cash'
												: balanceGroup === AccountsBalanceGroupOptions.DEBT
													? 'bg-debt'
													: balanceGroup === AccountsBalanceGroupOptions.INVESTMENT
														? 'bg-investment'
														: 'bg-other-assets'}"
										></div>
										{#if balanceGroup === AccountsBalanceGroupOptions.CASH}
											{m.accounts_group_cash_label()}
										{:else if balanceGroup === AccountsBalanceGroupOptions.DEBT}
											{m.accounts_group_debt_label()}
										{:else if balanceGroup === AccountsBalanceGroupOptions.INVESTMENT}
											{m.accounts_group_investment_label()}
										{:else if balanceGroup === AccountsBalanceGroupOptions.OTHER}
											{m.accounts_group_other_label()}
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground"
										>{m.accounts_balance_group_select_placeholder()}</span
									>
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={AccountsBalanceGroupOptions.CASH}>
									<div class="flex items-center gap-2">
										<div class="bg-cash size-2 rounded-full"></div>
										{m.accounts_group_cash_label()}
									</div>
								</Select.Item>
								<Select.Item value={AccountsBalanceGroupOptions.DEBT}>
									<div class="flex items-center gap-2">
										<div class="bg-debt size-2 rounded-full"></div>
										{m.accounts_group_debt_label()}
									</div>
								</Select.Item>
								<Select.Item value={AccountsBalanceGroupOptions.INVESTMENT}>
									<div class="flex items-center gap-2">
										<div class="bg-investment size-2 rounded-full"></div>
										{m.accounts_group_investment_label()}
									</div>
								</Select.Item>
								<Select.Item value={AccountsBalanceGroupOptions.OTHER}>
									<div class="flex items-center gap-2">
										<div class="bg-other-assets size-2 rounded-full"></div>
										{m.accounts_group_other_label()}
									</div>
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="currency" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_currency()}</Label
						>
						<Select.Root
							type="single"
							value={currency}
							onValueChange={(value) => {
								currency = value;
								currencyWasChanged = true;
							}}
						>
							<Select.Trigger id="currency" class="bg-background w-full">
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

					<FormFieldRow itemsAlignment="items-start">
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2">
							<Label for="notes" class="justify-start pr-0 md:justify-end"
								>{m.accounts_label_notes()}</Label
							>
							<span class="text-muted-foreground text-sm">{m.accounts_text_optional()}</span>
						</div>
						<Textarea id="notes" bind:value={notes} class="bg-background" />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label for="value" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_balance()}</Label
						>
						<CurrencyField id="value" name="value" bind:value {currency} />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
							>{m.accounts_label_marked_as()}</Label
						>
						<div class="space-y-2">
							<Label
								for="excluded"
								class="flex h-9 cursor-pointer items-center gap-2 rounded border px-3 py-1 font-normal"
							>
								<Checkbox id="excluded" bind:checked={excluded} class="bg-background" />
								<span>{m.accounts_label_exclude_from_net_worth()}</span>
							</Label>
							<Label
								for="closed"
								class="flex h-9 cursor-pointer items-center gap-2 rounded border px-3 py-1 font-normal"
							>
								<Checkbox id="closed" bind:checked={closed} class="bg-background" />
								<span>{m.accounts_label_closed()}</span>
							</Label>
						</div>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.accounts_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
