<script lang="ts">
	import { format } from 'date-fns';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { isDuplicateSecurityNameError, toNumber } from '$lib/utils';

	import DetailsForm from '../details-form.svelte';

	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const securityId = $derived(page.params.id);
	const security = $derived(securityId ? securitiesContext.getSecurity(securityId) : null);
	const securityCurrency = $derived(security?.currency ?? 'USD');

	let formData = $state({
		name: '',
		symbol: ''
	});
	function createSecurityBalanceFormData() {
		return {
			accountId: '',
			asOf: format(new Date(), 'yyyy-MM-dd'),
			quantity: '',
			price: '',
			value: '',
			costBasis: ''
		};
	}
	let balanceFormData = $state(createSecurityBalanceFormData());
	let isSavingBalance = $state(false);

	let syncState = $state({
		lastSyncedVersion: '',
		initialized: false,
		justSaved: false
	});
	const eligibleAccounts = $derived(
		accountsContext.accounts.filter((account) => !account.closed && account.canWrite)
	);
	const canSubmitBalance = $derived(
		Boolean(
			balanceFormData.accountId &&
				balanceFormData.asOf &&
				balanceFormData.quantity &&
				balanceFormData.price
		)
	);

	function securityVersion() {
		if (!security) return '';
		return `${security.updated || security.created}_${security.name}_${security.symbol}`;
	}

	function syncForm() {
		if (!security) return;
		formData = {
			name: security.name,
			symbol: security.symbol ?? ''
		};
		syncState.lastSyncedVersion = securityVersion();
		syncState.initialized = true;
	}

	$effect(() => {
		if (!security) return;

		const currentVersion = securityVersion();
		if (!syncState.initialized) {
			syncForm();
			return;
		}

		if (syncState.lastSyncedVersion === currentVersion) return;
		if (syncState.justSaved) {
			syncState.lastSyncedVersion = currentVersion;
			syncState.justSaved = false;
			return;
		}
		syncForm();
	});

	async function handleUpdateDetails() {
		if (!securityId) return;
		const securityName = formData.name.trim();
		if (!securityName) return;

		try {
			syncState.justSaved = true;
			await securitiesContext.updateSecurity(securityId, {
				name: securityName,
				symbol: formData.symbol.trim()
			});
			toast.success(m.securities_edit_success());
		} catch (error) {
			syncState.justSaved = false;
			if (isDuplicateSecurityNameError(error)) {
				toast.error(m.securities_name_duplicate());
				return;
			}
			logError('securityDetail', 'update', error);
			toast.error(m.securities_edit_failed());
		}
	}

	async function handleAddBalance() {
		const currentSecurityId = securityId;
		const currentOwnerId = ownerId;
		if (!currentSecurityId || !currentOwnerId || isSavingBalance) return;
		if (!balanceFormData.accountId) {
			toast.error(m.account_required());
			return;
		}
		if (!canSubmitBalance) return;

		try {
			isSavingBalance = true;
			await securitiesContext.addSecurityBalance(currentSecurityId, {
				account: balanceFormData.accountId,
				owner: currentOwnerId,
				asOf: new Date(`${balanceFormData.asOf}T12:00:00Z`).toISOString(),
				quantity: toNumber(balanceFormData.quantity),
				price: toNumber(balanceFormData.price),
				value: toNumber(balanceFormData.value),
				costBasis: toNumber(balanceFormData.costBasis)
			});
			balanceFormData = createSecurityBalanceFormData();
			toast.success(m.securities_balance_updated());
		} catch (error) {
			logError('securityDetail', 'add_balance', error);
			toast.error(m.securities_balance_failed());
		} finally {
			isSavingBalance = false;
		}
	}
</script>

<Section>
	<SectionTitle title={m.securities_section_add_balance()} />
	{#if securitiesContext.isLoading}
		<Skeleton class="h-36" />
	{:else}
		<div class="border-border overflow-hidden rounded border">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleAddBalance();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="security-balance-account" class="justify-start pr-0 md:justify-end">
							{m.securities_table_header_account()}
						</Label>
						<AccountPicker
							accounts={eligibleAccounts}
							bind:value={balanceFormData.accountId}
							id="security-balance-account"
							placeholder={m.securities_account_select_placeholder()}
							disabled={isSavingBalance}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="security-balance-as-of" class="justify-start pr-0 md:justify-end">
							{m.securities_table_header_as_of()}
						</Label>
						<Input
							id="security-balance-as-of"
							type="date"
							bind:value={balanceFormData.asOf}
							disabled={isSavingBalance}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="security-balance-quantity" class="justify-start pr-0 md:justify-end">
							{m.securities_table_header_quantity()}
						</Label>
						<CurrencyField
							id="security-balance-quantity"
							name="security-balance-quantity"
							bind:value={balanceFormData.quantity}
							disabled={isSavingBalance}
							isCurrency={false}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="security-balance-price" class="justify-start pr-0 md:justify-end">
							{m.securities_table_header_price()}
						</Label>
						<CurrencyField
							id="security-balance-price"
							name="security-balance-price"
							bind:value={balanceFormData.price}
							currency={securityCurrency}
							disabled={isSavingBalance}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="security-balance-value" class="justify-start pr-0 md:justify-end">
								{m.securities_table_header_value()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
						</div>
						<CurrencyField
							id="security-balance-value"
							name="security-balance-value"
							bind:value={balanceFormData.value}
							currency={securityCurrency}
							disabled={isSavingBalance}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="security-balance-cost-basis" class="justify-start pr-0 md:justify-end">
								{m.securities_table_header_cost_basis()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
						</div>
						<CurrencyField
							id="security-balance-cost-basis"
							name="security-balance-cost-basis"
							bind:value={balanceFormData.costBasis}
							currency={securityCurrency}
							disabled={isSavingBalance}
						/>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={isSavingBalance}>
							{m.securities_button_add_balance()}
						</Button>
					</div>
				</footer>
			</form>
		</div>
	{/if}
</Section>

<Section>
	<SectionTitle title={m.securities_section_details()} />
	{#if securitiesContext.isLoading || !security}
		<Skeleton class="h-36" />
	{:else}
		<DetailsForm {formData} currency={securityCurrency} onSubmit={handleUpdateDetails} />
	{/if}
</Section>
