<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
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
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { m } from '$lib/paraglide/messages';
	import { SecurityTransactionsTypeOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	type TransactionMode = '' | 'cash' | 'holdings';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed && a.canWrite));
	const openSecurityAccounts = $derived(openAccounts);
	const securityTypeOptions = Object.values(SecurityTransactionsTypeOptions);

	const rawMode = $derived(page.url.searchParams.get('mode'));
	const mode = $derived<TransactionMode>(
		rawMode === 'holdings' || rawMode === 'security' ? 'holdings' : rawMode === 'cash' ? 'cash' : ''
	);
	let description = $state('');
	let amount = $state('');
	let date = $state('');
	let accountId = $state('');
	let labelsInput = $state('');
	let notes = $state('');
	let excluded = $state(false);
	let securityAccountId = $state('');
	let securityId = $state('');
	let securityDate = $state('');
	let securityType = $state<SecurityTransactionsTypeOptions>(SecurityTransactionsTypeOptions.buy);
	let securitySubtype = $state('');
	let securityDescription = $state('');
	let quantity = $state('');
	let price = $state('');
	let securityAmount = $state('');
	let fees = $state('');
	let securityNotes = $state('');

	const selectedSecurity = $derived(
		securityId ? securitiesContext.securities.find((security) => security.id === securityId) : null
	);

	$effect(() => {
		if (rawMode !== 'security') return;

		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.set('mode', 'holdings');
		const search = params.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- query params are appended to a resolved base route
		goto(`${resolve('/transactions/add')}?${search}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});

	async function handleModeChange(value: string | undefined) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (value === 'holdings') {
			params.set('mode', 'holdings');
		} else if (value === 'cash') {
			params.set('mode', 'cash');
		} else {
			params.delete('mode');
		}
		const search = params.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- query params are appended to a resolved base route
		await goto(`${resolve('/transactions/add')}${search ? `?${search}` : ''}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function parseNullableNumber(value: string) {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function securityTypeLabel(type: SecurityTransactionsTypeOptions) {
		switch (type) {
			case SecurityTransactionsTypeOptions.buy:
				return m.transactions_security_type_buy();
			case SecurityTransactionsTypeOptions.sell:
				return m.transactions_security_type_sell();
			case SecurityTransactionsTypeOptions.cancel:
				return m.transactions_security_type_cancel();
			case SecurityTransactionsTypeOptions.cash:
				return m.transactions_security_type_cash();
			case SecurityTransactionsTypeOptions.fee:
				return m.transactions_security_type_fee();
			case SecurityTransactionsTypeOptions.transfer:
				return m.transactions_security_type_transfer();
		}
	}

	async function handleCashSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || !accountId) return;

		try {
			const labelIds: string[] = [];

			if (labelsInput.trim()) {
				const labelNames = labelsInput
					.split(',')
					.map((l) => l.trim())
					.filter(Boolean);

				for (const labelName of labelNames) {
					const labelId = await pb.findOrCreateLabel(labelName, currentOwnerId);
					labelIds.push(labelId);
				}
			}

			const transactionData: Record<string, unknown> = {
				account: accountId,
				owner: currentOwnerId,
				date: new Date(date + 'T12:00:00Z').toISOString(),
				description: description.trim() || undefined,
				value: amount ? parseFloat(amount) : undefined,
				labels: labelIds.length > 0 ? labelIds : undefined,
				notes: notes.trim() || undefined,
				excluded: excluded ? new Date().toISOString() : undefined
			};

			await pb.authedClient.collection('transactions').create(transactionData);

			toast.success(m.transactions_add_success());
			await goto(resolve('/transactions'));
		} catch (error) {
			console.error('Failed to create transaction:', error);
			toast.error(m.transactions_add_failed());
		}
	}

	async function handleSecuritySubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || !securityAccountId || !selectedSecurity) return;

		try {
			await pb.authedClient.collection('securityTransactions').create({
				account: securityAccountId,
				security: selectedSecurity.id,
				owner: currentOwnerId,
				date: new Date(securityDate + 'T12:00:00Z').toISOString(),
				type: securityType,
				subtype: securitySubtype.trim() || undefined,
				description: securityDescription.trim() || undefined,
				quantity: parseNullableNumber(quantity),
				price: parseNullableNumber(price),
				amount: parseNullableNumber(securityAmount),
				fees: parseNullableNumber(fees),
				notes: securityNotes.trim() || undefined
			});

			toast.success(m.transactions_security_add_success());
			await goto(resolve('/transactions/holdings'));
		} catch (error) {
			console.error('[securityTransactions:create]', error);
			toast.error(m.transactions_security_add_failed());
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
					<Breadcrumb.Link href="/transactions">{m.sidebar_transactions()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.transactions_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.transactions_add_page_title()}>
	<Section>
		<SectionTitle title={m.transactions_section_details()} />

		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					if (mode === 'cash') {
						handleCashSubmit();
					} else if (mode === 'holdings') {
						handleSecuritySubmit();
					}
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="activity" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_activity()}
						</Label>
						<Select.Root type="single" value={mode} onValueChange={handleModeChange}>
							<Select.Trigger id="activity" class="bg-background w-full">
								{#if mode === 'cash'}
									{m.transactions_mode_cash()}
								{:else if mode === 'holdings'}
									{m.transactions_mode_security()}
								{:else}
									<span class="text-muted-foreground">
										{m.transactions_activity_select_placeholder()}
									</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="cash">{m.transactions_mode_cash()}</Select.Item>
								<Select.Item value="holdings">{m.transactions_mode_security()}</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				{#if mode === 'cash'}
					<Fieldset>
						<FormFieldRow>
							<Label for="account" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_account()}
							</Label>
							<AccountPicker
								accounts={openAccounts}
								bind:value={accountId}
								id="account"
								placeholder={m.transactions_account_select_placeholder()}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="date" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_date()}
							</Label>
							<Input id="date" type="date" bind:value={date} required />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="description" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_description()}
							</Label>
							<Input id="description" bind:value={description} />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="amount" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_amount()}
							</Label>
							<CurrencyField id="amount" name="amount" bind:value={amount} required />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="labels" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_labels()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Input
								id="labels"
								bind:value={labelsInput}
								placeholder={m.transactions_labels_placeholder()}
							/>
						</FormFieldRow>

						<FormFieldRow itemsAlignment="items-start">
							<div
								class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2"
							>
								<Label for="notes" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_notes()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Textarea id="notes" bind:value={notes} class="bg-background" />
						</FormFieldRow>
					</Fieldset>

					<Fieldset>
						<FormFieldRow>
							<Label class="justify-start pr-0 md:justify-end">
								{m.transactions_label_mark_as()}
							</Label>
							<CheckboxLabel
								id="excluded"
								bind:checked={excluded}
								label={m.transactions_label_excluded_from_totals()}
							/>
						</FormFieldRow>
					</Fieldset>
				{:else if mode === 'holdings'}
					<Fieldset>
						<FormFieldRow>
							<Label for="security-account" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_account()}
							</Label>
							<AccountPicker
								accounts={openSecurityAccounts}
								bind:value={securityAccountId}
								id="security-account"
								placeholder={m.transactions_account_select_placeholder()}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="security-date" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_date()}
							</Label>
							<Input id="security-date" type="date" bind:value={securityDate} required />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="security" class="justify-start pr-0 md:justify-end">
								{m.transactions_security_label_security()}
							</Label>
							<Select.Root type="single" bind:value={securityId}>
								<Select.Trigger id="security" class="bg-background w-full">
									{#if selectedSecurity}
										{selectedSecurity.name}
									{:else}
										<span class="text-muted-foreground">
											{m.transactions_security_select_placeholder()}
										</span>
									{/if}
								</Select.Trigger>
								<Select.Content>
									{#if securitiesContext.isLoading}
										<Select.Item value="__loading_securities__" disabled>
											{m.transactions_securities_loading()}
										</Select.Item>
									{:else if securitiesContext.securities.length === 0}
										<Select.Item value="__empty_securities__" disabled>
											{m.transactions_securities_empty()}
										</Select.Item>
									{:else}
										{#each securitiesContext.securities as security (security.id)}
											<Select.Item value={security.id}>{security.name}</Select.Item>
										{/each}
									{/if}
								</Select.Content>
							</Select.Root>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="security-type" class="justify-start pr-0 md:justify-end">
								{m.transactions_security_label_type()}
							</Label>
							<Select.Root type="single" bind:value={securityType}>
								<Select.Trigger id="security-type" class="bg-background w-full">
									{securityTypeLabel(securityType)}
								</Select.Trigger>
								<Select.Content>
									{#each securityTypeOptions as type (type)}
										<Select.Item value={type}>{securityTypeLabel(type)}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="security-subtype" class="justify-start pr-0 md:justify-end">
									{m.transactions_security_label_subtype()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Input id="security-subtype" bind:value={securitySubtype} />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="security-description" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_description()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Input id="security-description" bind:value={securityDescription} />
						</FormFieldRow>
					</Fieldset>

					<Fieldset>
						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="quantity" class="justify-start pr-0 md:justify-end">
									{m.transactions_security_label_quantity()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<CurrencyField
								id="quantity"
								name="quantity"
								bind:value={quantity}
								isCurrency={false}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="price" class="justify-start pr-0 md:justify-end">
									{m.transactions_security_label_price()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<CurrencyField id="price" name="price" bind:value={price} />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="security-amount" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_amount()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<CurrencyField
								id="security-amount"
								name="security-amount"
								bind:value={securityAmount}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="fees" class="justify-start pr-0 md:justify-end">
									{m.transactions_security_label_fees()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<CurrencyField id="fees" name="fees" bind:value={fees} />
						</FormFieldRow>
					</Fieldset>

					<Fieldset>
						<FormFieldRow itemsAlignment="items-start">
							<div
								class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2"
							>
								<Label for="security-notes" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_notes()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Textarea id="security-notes" bind:value={securityNotes} class="bg-background" />
						</FormFieldRow>
					</Fieldset>
				{/if}

				{#if mode}
					<footer class="border-border bg-border border-t p-2">
						<div class="flex justify-end">
							<Button type="submit">{m.transactions_button_add()}</Button>
						</div>
					</footer>
				{/if}
			</form>
		</div>
	</Section>
</Page>
