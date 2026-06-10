<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import ClearButton from '$lib/components/clear-button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { securityTransactionTypeLabel } from '$lib/security-transaction-display';
	import {
		getSecurityTransactionsContext,
		type SecurityTransactionTypeFilter
	} from '$lib/security-transactions.svelte';

	const securityTxContext = getSecurityTransactionsContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const selectedAccount = $derived(
		securityTxContext.accountFilter
			? accountsContext.accounts.find((account) => account.id === securityTxContext.accountFilter)
			: null
	);
	const selectedSecurity = $derived(
		securityTxContext.securityFilter
			? securitiesContext.securities.find(
					(security) => security.id === securityTxContext.securityFilter
				)
			: null
	);

	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		securityTxContext.setSearch(target.value);
	}
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
	<div class="relative flex-1">
		<div class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
			{#if securityTxContext.isLoading}
				<LoaderCircleIcon class="size-4 animate-spin" />
			{:else}
				<SearchIcon class="size-4" />
			{/if}
		</div>
		<Input
			type="text"
			placeholder={m.trades_search_placeholder()}
			value={securityTxContext.search}
			oninput={handleSearchInput}
			class="bg-background pr-9 pl-9"
		/>
		{#if securityTxContext.search}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<ClearButton
					onclick={() => securityTxContext.setSearch('')}
					aria-label={m.transactions_clear_search()}
				/>
			</div>
		{/if}
	</div>
	<AccountPicker
		accounts={accountsContext.accounts}
		value={securityTxContext.accountFilter ?? ''}
		{selectedAccount}
		onValueChange={(value) => securityTxContext.setAccountFilter(value || null)}
		onClear={() => securityTxContext.setAccountFilter(null)}
		clearLabel={m.transactions_filter_account_clear()}
		ariaLabel={m.transactions_filter_account_label()}
		triggerClass="sm:w-fit sm:max-w-64"
		selectedNameClass="max-w-40 truncate"
		placeholder={m.transactions_filter_account_all()}
	/>
	<Select.Root
		type="single"
		value={securityTxContext.securityFilter ?? ''}
		onValueChange={(value) => securityTxContext.setSecurityFilter(value || null)}
	>
		<Select.Trigger
			aria-label={m.trades_filter_security_label()}
			class="bg-background w-full sm:w-fit sm:max-w-64"
		>
			{#if selectedSecurity}
				<div class="flex w-full items-center gap-2">
					<span class="max-w-40 truncate">{selectedSecurity.name}</span>
					<ClearButton
						class="ml-auto"
						onclick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							securityTxContext.setSecurityFilter(null);
						}}
						onpointerdown={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
						onpointerup={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
						aria-label={m.trades_filter_security_clear()}
					/>
				</div>
			{:else}
				{m.trades_filter_security_all()}
			{/if}
		</Select.Trigger>
		<Select.Content>
			{#each securitiesContext.securities as security (security.id)}
				<Select.Item value={security.id}>{security.name}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Select.Root
		type="single"
		value={securityTxContext.typeFilter}
		onValueChange={(value) =>
			securityTxContext.setTypeFilter((value || 'all') as SecurityTransactionTypeFilter)}
	>
		<Select.Trigger aria-label={m.trades_filter_type_label()} class="bg-background w-full sm:w-fit">
			{securityTransactionTypeLabel(securityTxContext.typeFilter)}
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">{securityTransactionTypeLabel('all')}</Select.Item>
			{#each securityTxContext.typeOptions as type (type)}
				<Select.Item value={type}>{securityTransactionTypeLabel(type)}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
