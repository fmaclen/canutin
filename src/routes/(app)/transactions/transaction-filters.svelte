<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { format, subDays } from 'date-fns';

	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import {
		getTransactionsContext,
		type KindFilter,
		type PeriodOption
	} from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();

	function formatCustomDateRange(from: Date, to: Date, label: string | null): string {
		if (label) return label;
		const toInclusive = subDays(to, 1);
		return `${format(from, 'MMM d, yyyy')} – ${format(toInclusive, 'MMM d, yyyy')}`;
	}

	function handleSearchInput(e: Event) {
		const target = e.target as HTMLInputElement;
		txContext.setSearch(target.value);
	}

	function clearSearch() {
		txContext.setSearch('');
	}

	function periodLabel(option: PeriodOption) {
		switch (option) {
			case 'this-month':
				return m.transactions_filter_period_this_month();
			case 'last-month':
				return m.transactions_filter_period_last_month();
			case 'last-3-months':
				return m.transactions_filter_period_last_3_months();
			case 'last-6-months':
				return m.transactions_filter_period_last_6_months();
			case 'last-12-months':
				return m.transactions_filter_period_last_12_months();
			case 'year-to-date':
				return m.transactions_filter_period_year_to_date();
			case 'last-year':
				return m.transactions_filter_period_last_year();
			case 'lifetime':
			default:
				return m.transactions_filter_period_lifetime();
		}
	}

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

<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
	<div class="relative flex-1">
		<div class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
			{#if txContext.isLoading}
				<LoaderCircleIcon class="size-4 animate-spin" />
			{:else}
				<SearchIcon class="size-4" />
			{/if}
		</div>
		<Input
			type="text"
			placeholder={m.transactions_search_placeholder()}
			value={txContext.search}
			oninput={handleSearchInput}
			class="bg-background pr-9 pl-9"
		/>
		{#if txContext.search}
			<button
				type="button"
				onclick={clearSearch}
				aria-label={m.transactions_clear_search()}
				class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
			>
				<XIcon class="size-4" />
			</button>
		{/if}
	</div>
	<Select.Root type="single" bind:value={txContext.period}>
		<Select.Trigger aria-label={m.transactions_filter_period_label()} class="bg-background sm:w-48">
			{#if txContext.isCustomRange && txContext.customFromDate && txContext.customToDate}
				{formatCustomDateRange(
					txContext.customFromDate,
					txContext.customToDate,
					txContext.customLabel
				)}
			{:else}
				{periodLabel(txContext.period)}
			{/if}
		</Select.Trigger>
		<Select.Content>
			{#each txContext.periodOptions as option (option)}
				<Select.Item value={option}>{periodLabel(option)}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Select.Root type="single" bind:value={txContext.kind}>
		<Select.Trigger aria-label={m.transactions_filter_kind_label()} class="bg-background sm:w-48">
			{kindLabel(txContext.kind)}
		</Select.Trigger>
		<Select.Content>
			{#each txContext.kindOptions as option (option)}
				<Select.Item value={option}>{kindLabel(option)}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
