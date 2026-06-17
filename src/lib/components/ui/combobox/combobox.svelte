<script lang="ts" module>
	export type ComboboxItem = {
		value: string;
		label: string;
		disabled?: boolean;
		keywords?: string[];
		group?: string;
	};
</script>

<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { tick, type Snippet } from 'svelte';

	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils.js';

	type Value = string | string[];

	let {
		items,
		type = 'single',
		value = $bindable(),
		onValueChange,
		placeholder,
		searchPlaceholder = m.select_search_placeholder(),
		emptyText = m.select_search_no_results(),
		isLoading = false,
		disabled = false,
		id,
		ariaLabel,
		triggerClass,
		contentClass,
		groupOrder,
		open = $bindable(false),
		triggerContent,
		itemContent,
		groupHeading,
		pinned
	}: {
		items: ComboboxItem[];
		type?: 'single' | 'multiple';
		value?: Value;
		onValueChange?: (value: Value) => void;
		placeholder: string;
		searchPlaceholder?: string;
		emptyText?: string;
		isLoading?: boolean;
		disabled?: boolean;
		id?: string;
		ariaLabel?: string;
		triggerClass?: string;
		contentClass?: string;
		groupOrder?: string[];
		open?: boolean;
		triggerContent?: Snippet<[{ selected: ComboboxItem[]; open: boolean }]>;
		itemContent?: Snippet<[{ item: ComboboxItem; selected: boolean }]>;
		groupHeading?: Snippet<[{ key: string }]>;
		pinned?: Snippet<[{ close: () => void }]>;
	} = $props();

	let triggerRef = $state<HTMLButtonElement | null>(null);

	const selectedValues = $derived(
		type === 'multiple' ? ((value as string[] | undefined) ?? []) : value ? [value as string] : []
	);

	const selectedItems = $derived(
		selectedValues
			.map((entry) => items.find((option) => option.value === entry))
			.filter((option): option is ComboboxItem => option !== undefined)
	);

	const triggerLabel = $derived(
		selectedItems.length === 0
			? placeholder
			: selectedItems.map((option) => option.label).join(', ')
	);

	const groups = $derived.by(() => {
		const collected: { key: string; items: ComboboxItem[] }[] = [];
		for (const entry of items) {
			const key = entry.group ?? '';
			const existing = collected.find((group) => group.key === key);
			if (existing) existing.items.push(entry);
			else collected.push({ key, items: [entry] });
		}
		if (!groupOrder) return collected;
		return [...collected].sort(
			(left, right) => groupOrder.indexOf(left.key) - groupOrder.indexOf(right.key)
		);
	});

	const hasGroups = $derived(items.some((entry) => entry.group !== undefined));

	function isSelected(itemValue: string) {
		return selectedValues.includes(itemValue);
	}

	function close() {
		open = false;
		tick().then(() => triggerRef?.focus());
	}

	function handleSelect(itemValue: string) {
		if (type === 'multiple') {
			const next = isSelected(itemValue)
				? selectedValues.filter((entry) => entry !== itemValue)
				: [...selectedValues, itemValue];
			value = next;
			onValueChange?.(next);
			return;
		}
		value = itemValue;
		onValueChange?.(itemValue);
		close();
	}

	// NOTE: The first argument is the item's `value` (a PocketBase id). It is deliberately
	// ignored so ids never pollute matches; scoring runs against the label/keywords only.
	function comboboxFilter(_value: string, search: string, keywords?: string[]) {
		const needle = search.trim().toLowerCase();
		if (!needle) return 1;
		const haystack = (keywords ?? []).join(' ').toLowerCase();
		return haystack.includes(needle) ? 1 : 0;
	}
</script>

{#snippet commandItem(entry: ComboboxItem)}
	<Command.Item
		value={entry.value}
		keywords={[entry.label, ...(entry.keywords ?? [])]}
		disabled={entry.disabled}
		onSelect={() => handleSelect(entry.value)}
	>
		{#if itemContent}
			{@render itemContent({ item: entry, selected: isSelected(entry.value) })}
		{:else}
			<CheckIcon class={cn('size-4', !isSelected(entry.value) && 'text-transparent')} />
			{entry.label}
		{/if}
	</Command.Item>
{/snippet}

<Popover.Root bind:open>
	<Popover.SelectTrigger
		bind:ref={triggerRef}
		{id}
		aria-label={ariaLabel}
		{disabled}
		data-placeholder={selectedItems.length === 0 ? '' : undefined}
		class={cn('bg-background w-full', triggerClass)}
	>
		{#if triggerContent}
			{@render triggerContent({ selected: selectedItems, open })}
		{:else}
			<span class="truncate">{triggerLabel}</span>
		{/if}
	</Popover.SelectTrigger>
	<Popover.Content class={cn('w-(--bits-popover-anchor-width) p-0', contentClass)} align="start">
		<Command.Root filter={comboboxFilter}>
			<Command.Input placeholder={searchPlaceholder} autofocus />
			<Command.List>
				{#if isLoading}
					<Command.Loading class="flex justify-center py-6">
						<LoaderCircleIcon class="text-muted-foreground size-4 animate-spin" />
					</Command.Loading>
				{:else if items.length === 0 && !pinned}
					<Command.Item disabled forceMount>{emptyText}</Command.Item>
				{:else}
					{#if pinned}
						<Command.Group forceMount>
							{@render pinned({ close })}
						</Command.Group>
					{/if}
					{#if items.length > 0}
						<Command.Empty>{m.select_search_no_results()}</Command.Empty>
					{/if}
					{#if hasGroups}
						{#each groups as entry (entry.key)}
							<Command.Group value={entry.key || undefined}>
								{#snippet headingContent()}
									{#if groupHeading}
										{@render groupHeading({ key: entry.key })}
									{:else}
										{entry.key}
									{/if}
								{/snippet}
								{#each entry.items as groupItem (groupItem.value)}
									{@render commandItem(groupItem)}
								{/each}
							</Command.Group>
						{/each}
					{:else}
						{#each items as entry (entry.value)}
							{@render commandItem(entry)}
						{/each}
					{/if}
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
