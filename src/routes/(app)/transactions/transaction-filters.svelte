<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import type { DateRange } from 'bits-ui';
	import { addDays, format, subDays } from 'date-fns';

	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { m } from '$lib/paraglide/messages';
	import {
		getTransactionsContext,
		type KindFilter,
		type PeriodOption
	} from '$lib/transactions.svelte';

	const txContext = getTransactionsContext();

	let periodPopoverOpen = $state(false);

	function dateToCalendarDate(date: Date): CalendarDate {
		return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	// Derive calendar value from context's custom range (for URL param initialization)
	// or use local selection state
	let calendarValue: DateRange | undefined = $derived.by(() => {
		if (txContext.isCustomRange && txContext.customFromDate && txContext.customToDate) {
			const toInclusive = subDays(txContext.customToDate, 1);
			return {
				start: dateToCalendarDate(txContext.customFromDate),
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
		if (txContext.isCustomRange && txContext.customFromDate && txContext.customToDate) {
			return formatCustomDateRange(
				txContext.customFromDate,
				txContext.customToDate,
				txContext.customLabel
			);
		}
		return periodLabel(txContext.period);
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
	<Popover.Root bind:open={periodPopoverOpen}>
		<Popover.Trigger
			aria-label={m.transactions_filter_period_label()}
			class="border-input focus-visible:border-ring focus-visible:ring-ring/50 data-[placeholder]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 [&_svg:not([class*='text-'])]:text-muted-foreground bg-background flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none select-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 sm:w-48"
		>
			<span class="truncate">{getPeriodTriggerText()}</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="size-4 shrink-0 opacity-50"
			>
				<path d="m6 9 6 6 6-6" />
			</svg>
		</Popover.Trigger>
		<Popover.Content class="w-auto p-0" align="start" collisionPadding={16}>
			<div class="flex">
				<div class="flex flex-col border-r p-2">
					{#each txContext.periodOptions as option (option)}
						<Button
							variant="ghost"
							class="justify-start font-normal"
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
