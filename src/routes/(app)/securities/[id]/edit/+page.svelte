<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	import BalanceFields from '../../balance-fields.svelte';
	import { createSecurityBalanceFormData, toSecurityBalanceInput } from '../../balance-form';
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
			logError('securityDetail', 'update', error);
			syncState.justSaved = false;
			toast.error(m.securities_edit_failed());
		}
	}

	async function handleAddBalance() {
		const currentSecurityId = securityId;
		const currentOwnerId = ownerId;
		if (!currentSecurityId || !currentOwnerId || isSavingBalance || !canSubmitBalance) return;

		try {
			isSavingBalance = true;
			await securitiesContext.addSecurityBalance(
				currentSecurityId,
				toSecurityBalanceInput(balanceFormData, currentOwnerId)
			);
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
				<BalanceFields
					formData={balanceFormData}
					accounts={eligibleAccounts}
					currency={securityCurrency}
					isFirst={true}
					disabled={isSavingBalance}
				/>

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
