<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import type { DateRange } from 'bits-ui';
	import { addDays, format, subDays } from 'date-fns';

	import {
		BALANCE_GROUP_ORDER,
		getBalanceGroupMeta,
		groupAccountsByBalanceGroup
	} from '$lib/account-utils';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import ClearButton from '$lib/components/clear-button.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import {
		getTransactionsContext,
		type KindFilter,
		type PeriodOption
	} from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();
	const accountsContext = getAccountsContext();

	const groupMeta = getBalanceGroupMeta();
	let accountsByGroup = $derived(groupAccountsByBalanceGroup(accountsContext.accounts));
	let selectedAccount = $derived(
		txContext.accountFilter
			? accountsContext.accounts.find((a) => a.id === txContext.accountFilter)
			: null
	);

	let periodPopoverOpen = $state(false);

	function dateToCalendarDate(date: Date): CalendarDate {
		return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	// Derive calendar value from context's custom range (for URL param initialization)
	let calendarValue: DateRange | undefined = $derived.by(() => {
		const range = txContext.customRange;
		if (range) {
			const toInclusive = subDays(range.to, 1);
			return {
				start: dateToCalendarDate(range.from),
				end: dateToCalendarDate(toInclusive)
			};
		}
		return undefined;
	});

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

	function handlePresetClick(option: PeriodOption) {
		txContext.setPresetPeriod(option);
		periodPopoverOpen = false;
	}

	function isPresetSelected(option: PeriodOption): boolean {
		return !txContext.isCustomRange && txContext.period === option;
	}

	function dateValueToDate(dateValue: DateValue): Date {
		return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
	}

	function handleCalendarChange(value: DateRange | undefined) {
		if (value?.start && value?.end) {
			const fromDate = dateValueToDate(value.start);
			const toDate = addDays(dateValueToDate(value.end), 1);
			txContext.setCustomRange(fromDate, toDate);
			periodPopoverOpen = false;
		}
	}

	function getPeriodTriggerText(): string {
		const range = txContext.customRange;
		if (range) {
			return formatCustomDateRange(range.from, range.to, range.label);
		}
		return periodLabel(txContext.period);
	}
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
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
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<ClearButton onclick={clearSearch} aria-label={m.transactions_clear_search()} />
			</div>
		{/if}
	</div>
	<Popover.Root bind:open={periodPopoverOpen}>
		<Popover.SelectTrigger
			aria-label={m.transactions_filter_period_label()}
			class="bg-background w-full sm:w-48"
		>
			<span class="truncate">{getPeriodTriggerText()}</span>
		</Popover.SelectTrigger>
		<Popover.Content class="w-auto p-0" align="start" collisionPadding={32}>
			<div class="flex">
				<div class="flex flex-col border-r p-2">
					{#each txContext.periodOptions as option (option)}
						<Button
							variant="ghost"
							class="data-[selected]:bg-accent data-[selected]:text-accent-foreground justify-start font-normal"
							data-selected={isPresetSelected(option) ? '' : undefined}
							onclick={() => handlePresetClick(option)}
						>
							{periodLabel(option)}
						</Button>
					{/each}
				</div>
				<div class="p-2">
					<RangeCalendar
						value={calendarValue}
						onValueChange={handleCalendarChange}
						numberOfMonths={2}
						placeholder={calendarValue?.start}
						disableDaysOutsideMonth
					/>
				</div>
			</div>
		</Popover.Content>
	</Popover.Root>
	<Select.Root
		type="single"
		value={txContext.kind}
		onValueChange={(v) => txContext.setKind(v as KindFilter)}
	>
		<Select.Trigger
			aria-label={m.transactions_filter_kind_label()}
			class="bg-background w-full sm:w-48"
		>
			{kindLabel(txContext.kind)}
		</Select.Trigger>
		<Select.Content>
			{#each txContext.kindOptions as option (option)}
				<Select.Item value={option}>{kindLabel(option)}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Select.Root
		type="single"
		value={txContext.accountFilter ?? ''}
		onValueChange={(v) => txContext.setAccountFilter(v || null)}
	>
		<Select.Trigger
			aria-label={m.transactions_filter_account_label()}
			class="bg-background w-full sm:w-48"
		>
			{#if selectedAccount}
				<div class="flex items-center gap-2">
					<div
						class="size-2 shrink-0 rounded-full {groupMeta[
							selectedAccount.balanceGroup as AccountsBalanceGroupOptions
						].color}"
					></div>
					<span class="truncate">{selectedAccount.name}</span>
					<ClearButton
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							txContext.setAccountFilter(null);
						}}
						onpointerdown={(e) => {
							e.preventDefault();
							e.stopPropagation();
						}}
						aria-label={m.transactions_filter_account_clear()}
					/>
				</div>
			{:else}
				{m.transactions_filter_account_all()}
			{/if}
		</Select.Trigger>
		<Select.Content>
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
		</Select.Content>
	</Select.Root>
</div>
