<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import type { DateRange } from 'bits-ui';
	import { addDays, format, subDays } from 'date-fns';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import ClearButton from '$lib/components/clear-button.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { securityTransactionTypeLabel } from '$lib/security-transaction-display';
	import {
		getSecurityTransactionsContext,
		type SecurityTransactionTypeFilter
	} from '$lib/security-transactions.svelte';
	import type { PeriodOption } from '$lib/transactions.svelte';

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

	let periodPopoverOpen = $state(false);

	function dateToCalendarDate(date: Date) {
		return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	// Derive calendar value from context's custom range (for URL param initialization)
	let calendarValue: DateRange | undefined = $derived.by(() => {
		const range = securityTxContext.customRange;
		if (range) {
			const toInclusive = subDays(range.to, 1);
			return {
				start: dateToCalendarDate(range.from),
				end: dateToCalendarDate(toInclusive)
			};
		}
		return undefined;
	});

	function formatCustomDateRange(from: Date, to: Date, label: string | null) {
		if (label) return label;
		const toInclusive = subDays(to, 1);
		return `${format(from, 'MMM d, yyyy')} – ${format(toInclusive, 'MMM d, yyyy')}`;
	}

	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		securityTxContext.setSearch(target.value);
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

	function handlePresetClick(option: PeriodOption) {
		securityTxContext.setPresetPeriod(option);
		periodPopoverOpen = false;
	}

	function isPresetSelected(option: PeriodOption) {
		return !securityTxContext.isCustomRange && securityTxContext.period === option;
	}

	function dateValueToDate(dateValue: DateValue) {
		return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
	}

	function handleCalendarChange(value: DateRange | undefined) {
		if (value?.start && value?.end) {
			const fromDate = dateValueToDate(value.start);
			const toDate = addDays(dateValueToDate(value.end), 1);
			securityTxContext.setCustomRange(fromDate, toDate);
			periodPopoverOpen = false;
		}
	}

	function getPeriodTriggerText() {
		const range = securityTxContext.customRange;
		if (range) {
			return formatCustomDateRange(range.from, range.to, range.label);
		}
		return periodLabel(securityTxContext.period);
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
	<Popover.Root bind:open={periodPopoverOpen}>
		<Popover.SelectTrigger
			aria-label={m.transactions_filter_period_label()}
			class="bg-background w-full sm:w-fit"
		>
			<span class="truncate">{getPeriodTriggerText()}</span>
		</Popover.SelectTrigger>
		<Popover.Content class="w-auto p-0" align="start" collisionPadding={32}>
			<div class="flex">
				<div class="flex flex-col border-r p-2">
					{#each securityTxContext.periodOptions as option (option)}
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
			{securityTxContext.typeFilter === 'all'
				? m.trades_filter_type_all()
				: securityTransactionTypeLabel(securityTxContext.typeFilter)}
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">{m.trades_filter_type_all()}</Select.Item>
			{#each securityTxContext.typeOptions as type (type)}
				<Select.Item value={type}>{securityTransactionTypeLabel(type)}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
