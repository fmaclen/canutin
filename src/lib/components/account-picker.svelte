<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';

	import { BALANCE_GROUP_ORDER, getBalanceGroupMeta } from '$lib/account-utils';
	import ClearButton from '$lib/components/clear-button.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Combobox, type ComboboxItem } from '$lib/components/ui/combobox/index.js';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { cn } from '$lib/utils';

	export type AccountPickerAccount = {
		id: string;
		name: string;
		balanceGroup: AccountsBalanceGroupOptions;
		currency: string;
	};

	let {
		accounts,
		value = $bindable(''),
		selectedAccount = undefined,
		placeholder,
		id = undefined,
		ariaLabel = undefined,
		disabled = false,
		triggerClass = undefined,
		selectedNameClass = undefined,
		clearLabel = undefined,
		onClear = undefined,
		onValueChange = undefined
	}: {
		accounts: AccountPickerAccount[];
		value?: string;
		selectedAccount?: AccountPickerAccount | null;
		placeholder: string;
		id?: string;
		ariaLabel?: string;
		disabled?: boolean;
		triggerClass?: string;
		selectedNameClass?: string;
		clearLabel?: string;
		onClear?: () => void;
		onValueChange?: (value: string) => void;
	} = $props();

	const groupMeta = getBalanceGroupMeta();
	const items = $derived(
		accounts.map(
			(account): ComboboxItem => ({
				value: account.id,
				label: account.name,
				group: account.balanceGroup
			})
		)
	);
	const triggerAccount = $derived(
		selectedAccount === undefined
			? accounts.find((account) => account.id === value)
			: selectedAccount
	);

	function handleClear(event: MouseEvent | PointerEvent) {
		event.preventDefault();
		event.stopPropagation();
		onClear?.();
	}
</script>

<Combobox
	type="single"
	bind:value
	{items}
	{id}
	{ariaLabel}
	{disabled}
	{placeholder}
	onValueChange={(next) => {
		if (typeof next === 'string') onValueChange?.(next);
	}}
	groupOrder={BALANCE_GROUP_ORDER}
	emptyText={m.account_picker_empty()}
	triggerClass={cn('pl-3', triggerClass)}
>
	{#snippet triggerContent()}
		{#if triggerAccount}
			<div class="flex w-full items-center gap-2">
				<div
					class="size-2 shrink-0 rounded-full {groupMeta[triggerAccount.balanceGroup].color}"
				></div>
				<span class={cn(selectedNameClass)}>{triggerAccount.name}</span>
				{#if triggerAccount.currency !== interfacePreferences.displayCurrency}
					<Badge
						variant="outline"
						class="border-border/60 text-foreground/70 shrink-0 font-normal uppercase"
					>
						{triggerAccount.currency}
					</Badge>
				{/if}
				{#if onClear && clearLabel}
					<ClearButton
						class="ml-auto"
						onclick={handleClear}
						onpointerdown={handleClear}
						onpointerup={handleClear}
						aria-label={clearLabel}
					/>
				{/if}
			</div>
		{:else}
			<span class="text-muted-foreground">{placeholder}</span>
		{/if}
	{/snippet}
	{#snippet itemContent({ item, selected })}
		{@const account = accounts.find((entry) => entry.id === item.value)}
		<CheckIcon class={cn('size-4', !selected && 'text-transparent')} />
		<span class="truncate">{item.label}</span>
		{#if account && account.currency !== interfacePreferences.displayCurrency}
			<Badge
				variant="outline"
				class="border-border/60 text-foreground/70 ml-auto shrink-0 font-normal uppercase"
			>
				{account.currency}
			</Badge>
		{/if}
	{/snippet}
	{#snippet groupHeading({ key })}
		<div class="size-2 rounded-full {groupMeta[key as AccountsBalanceGroupOptions].color}"></div>
		{groupMeta[key as AccountsBalanceGroupOptions].label}
	{/snippet}
</Combobox>
