<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import ClearButton from '$lib/components/clear-button.svelte';
	import FilterBar from '$lib/components/filter-bar.svelte';
	import { Combobox } from '$lib/components/ui/combobox/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getTransactionsContext, type KindFilter } from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();
	const accountsContext = getAccountsContext();

	let selectedAccount = $derived(
		txContext.accountFilter
			? accountsContext.accounts.find((a) => a.id === txContext.accountFilter)
			: null
	);
	let labelTriggerText = $derived.by(() => {
		const selected = txContext.labelFilters;
		if (selected.length === 0) return m.transactions_filter_label_all();
		if (selected.length === 1) {
			const label = txContext.transactionLabels.find((l) => l.id === selected[0]);
			return label?.name ?? m.transactions_filter_label_all();
		}
		return m.transactions_filter_label_count({ count: selected.length });
	});

	function kindLabel(option: KindFilter) {
		switch (option) {
			case 'credits':
				return m.transactions_filter_kind_credits_only();
			case 'debits':
				return m.transactions_filter_kind_debits_only();
			case 'excluded':
				return m.transactions_filter_kind_excluded_only();
			case 'all':
			default:
				return m.transactions_filter_kind_any_amounts();
		}
	}
</script>

<FilterBar
	search={txContext.search}
	isLoading={txContext.isLoading}
	searchPlaceholder={m.transactions_search_placeholder()}
	setSearch={(query) => txContext.setSearch(query)}
	period={txContext.period}
	periodOptions={txContext.periodOptions}
	customRange={txContext.customRange}
	setPresetPeriod={(option) => txContext.setPresetPeriod(option)}
	setCustomRange={(from, to) => txContext.setCustomRange(from, to)}
>
	{#snippet controls()}
		<Select.Root
			type="single"
			value={txContext.kind}
			onValueChange={(v) => txContext.setKind(v as KindFilter)}
		>
			<Select.Trigger
				aria-label={m.transactions_filter_kind_label()}
				class="bg-background w-full sm:w-fit"
			>
				{kindLabel(txContext.kind)}
			</Select.Trigger>
			<Select.Content>
				{#each txContext.kindOptions as option (option)}
					<Select.Item value={option}>{kindLabel(option)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<AccountPicker
			accounts={accountsContext.accounts}
			value={txContext.accountFilter ?? ''}
			{selectedAccount}
			onValueChange={(value) => txContext.setAccountFilter(value || null)}
			onClear={() => txContext.setAccountFilter(null)}
			clearLabel={m.transactions_filter_account_clear()}
			ariaLabel={m.transactions_filter_account_label()}
			triggerClass="sm:w-fit sm:max-w-64"
			selectedNameClass="max-w-40 truncate"
			placeholder={m.transactions_filter_account_all()}
		/>
		<Combobox
			type="multiple"
			value={txContext.labelFilters}
			onValueChange={(v) => txContext.setLabelFilters(Array.isArray(v) ? v : [v])}
			items={txContext.transactionLabels.map((l) => ({ value: l.id, label: l.name }))}
			placeholder={m.transactions_filter_label_all()}
			ariaLabel={m.transactions_filter_label_label()}
			triggerClass="sm:w-fit sm:max-w-64"
		>
			{#snippet triggerContent()}
				{#if txContext.labelFilters.length > 0}
					<div class="flex w-full items-center gap-2">
						<span class="max-w-40 truncate">{labelTriggerText}</span>
						<ClearButton
							class="ml-auto"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								txContext.clearLabelFilters();
							}}
							onpointerdown={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onpointerup={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							aria-label={m.transactions_filter_label_clear()}
						/>
					</div>
				{:else}
					{labelTriggerText}
				{/if}
			{/snippet}
		</Combobox>
	{/snippet}
</FilterBar>
