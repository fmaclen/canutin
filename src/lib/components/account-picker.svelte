<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	import { BALANCE_GROUP_ORDER, getBalanceGroupMeta } from '$lib/account-utils';
	import ClearButton from '$lib/components/clear-button.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { cn } from '$lib/utils';

	export type AccountPickerAccount = {
		id: string;
		name: string;
		balanceGroup: AccountsBalanceGroupOptions;
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
	const accountsByGroup = $derived.by(() => {
		const grouped = new SvelteMap<AccountsBalanceGroupOptions, AccountPickerAccount[]>();
		for (const account of accounts) {
			const group = account.balanceGroup;
			grouped.set(group, [...(grouped.get(group) ?? []), account]);
		}
		return grouped;
	});
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

<Select.Root type="single" bind:value {disabled} {onValueChange}>
	<Select.Trigger {id} aria-label={ariaLabel} class={cn('bg-background w-full pl-3', triggerClass)}>
		{#if triggerAccount}
			<div class="flex w-full items-center gap-2">
				<div
					class="size-2 shrink-0 rounded-full {groupMeta[triggerAccount.balanceGroup].color}"
				></div>
				<span class={cn(selectedNameClass)}>{triggerAccount.name}</span>
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
	</Select.Trigger>
	<Select.Content>
		{#if accounts.length === 0}
			<Select.Item value="__empty_accounts__" disabled>{m.account_picker_empty()}</Select.Item>
		{:else}
			{#each BALANCE_GROUP_ORDER as group (group)}
				{@const accountsInGroup = accountsByGroup.get(group) ?? []}
				{#if accountsInGroup.length > 0}
					<Select.Group>
						<Select.Label>
							<div class="flex items-center gap-2">
								<div class="size-2 rounded-full {groupMeta[group].color}"></div>
								{groupMeta[group].label}
							</div>
						</Select.Label>
						{#each accountsInGroup as account (account.id)}
							<Select.Item value={account.id}>{account.name}</Select.Item>
						{/each}
					</Select.Group>
				{/if}
			{/each}
		{/if}
	</Select.Content>
</Select.Root>
