<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import ClearButton from '$lib/components/clear-button.svelte';
	import FilterBar from '$lib/components/filter-bar.svelte';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { securityComboboxLabel, tradeTypeLabel } from '$lib/trade-display';
	import { getTradesContext, type TradeTypeFilter } from '$lib/trades.svelte';

	const tradesContext = getTradesContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const selectedAccount = $derived(
		tradesContext.accountFilter
			? accountsContext.accounts.find((account) => account.id === tradesContext.accountFilter)
			: null
	);
	const securityItems = $derived(
		securitiesContext.securities.map((security) => ({
			value: security.id,
			label: securityComboboxLabel(security),
			keywords: security.symbol ? [security.symbol] : undefined
		}))
	);
</script>

<FilterBar
	search={tradesContext.search}
	isLoading={tradesContext.isLoading}
	searchPlaceholder={m.trades_search_placeholder()}
	setSearch={(query) => tradesContext.setSearch(query)}
	period={tradesContext.period}
	periodOptions={tradesContext.periodOptions}
	customRange={tradesContext.customRange}
	setPresetPeriod={(option) => tradesContext.setPresetPeriod(option)}
	setCustomRange={(from, to) => tradesContext.setCustomRange(from, to)}
>
	{#snippet controls()}
		<AccountPicker
			accounts={accountsContext.accounts}
			value={tradesContext.accountFilter ?? ''}
			{selectedAccount}
			onValueChange={(value) => tradesContext.setAccountFilter(value || null)}
			onClear={() => tradesContext.setAccountFilter(null)}
			clearLabel={m.transactions_filter_account_clear()}
			ariaLabel={m.transactions_filter_account_label()}
			triggerClass="sm:w-fit sm:max-w-64"
			selectedNameClass="max-w-40 truncate"
			placeholder={m.transactions_filter_account_all()}
		/>
		<Combobox
			type="single"
			items={securityItems}
			value={tradesContext.securityFilter ?? ''}
			onValueChange={(value) =>
				tradesContext.setSecurityFilter(typeof value === 'string' && value ? value : null)}
			placeholder={m.trades_filter_security_all()}
			ariaLabel={m.trades_filter_security_label()}
			triggerClass="sm:w-fit sm:max-w-64"
		>
			{#snippet triggerContent({ selected })}
				{#if selected.length > 0}
					<div class="flex w-full items-center gap-2">
						<span class="max-w-40 truncate">{selected[0].label}</span>
						<ClearButton
							class="ml-auto"
							onclick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								tradesContext.setSecurityFilter(null);
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
			{/snippet}
		</Combobox>
		<Select.Root
			type="single"
			value={tradesContext.typeFilter}
			onValueChange={(value) => tradesContext.setTypeFilter((value || 'all') as TradeTypeFilter)}
		>
			<Select.Trigger
				aria-label={m.trades_filter_type_label()}
				class="bg-background w-full sm:w-fit"
			>
				{tradesContext.typeFilter === 'all'
					? m.trades_filter_type_all()
					: tradeTypeLabel(tradesContext.typeFilter)}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="all">{m.trades_filter_type_all()}</Select.Item>
				{#each tradesContext.typeOptions as type (type)}
					<Select.Item value={type}>{tradeTypeLabel(type)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	{/snippet}
</FilterBar>
