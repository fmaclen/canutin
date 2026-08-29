<script lang="ts">
	import { CalendarDate } from '@internationalized/date';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { addDays, subDays } from 'date-fns';
	import type { Snippet } from 'svelte';

	import ClearButton from '$lib/components/clear-button.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PeriodOption } from '$lib/transactions.svelte';

	type CustomRange = { from: Date; to: Date; label: string | null };

	let {
		search,
		isLoading,
		searchPlaceholder,
		setSearch,
		period,
		periodOptions,
		customRange,
		setPresetPeriod,
		setCustomRange,
		controls
	}: {
		search: string;
		isLoading: boolean;
		searchPlaceholder: string;
		setSearch: (query: string) => void;
		period?: PeriodOption;
		periodOptions?: PeriodOption[];
		customRange?: CustomRange | null;
		setPresetPeriod?: (option: PeriodOption) => void;
		setCustomRange?: (from: Date, to: Date) => void;
		controls: Snippet;
	} = $props();

	let periodPopoverOpen = $state(false);

	const calendarValue = $derived.by(() => {
		if (!customRange) return undefined;
		const toInclusive = subDays(customRange.to, 1);
		return {
			start: new CalendarDate(
				customRange.from.getUTCFullYear(),
				customRange.from.getUTCMonth() + 1,
				customRange.from.getUTCDate()
			),
			end: new CalendarDate(
				toInclusive.getUTCFullYear(),
				toInclusive.getUTCMonth() + 1,
				toInclusive.getUTCDate()
			)
		};
	});

	const periodLabels: Record<PeriodOption, () => string> = {
		'this-month': m.transactions_filter_period_this_month,
		'last-month': m.transactions_filter_period_last_month,
		'last-3-months': m.transactions_filter_period_last_3_months,
		'last-6-months': m.transactions_filter_period_last_6_months,
		'last-12-months': m.transactions_filter_period_last_12_months,
		'year-to-date': m.transactions_filter_period_year_to_date,
		'last-year': m.transactions_filter_period_last_year,
		lifetime: m.transactions_filter_period_lifetime
	};

	const periodTriggerText = $derived.by(() => {
		if (!customRange) return period ? periodLabels[period]() : '';
		if (customRange.label) return customRange.label;
		const dateFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return `${dateFormatter.format(customRange.from)} – ${dateFormatter.format(subDays(customRange.to, 1))}`;
	});
</script>

<div class="flex flex-col gap-2 max-sm:-mt-0.5 max-sm:mb-3.5 sm:flex-row sm:items-center">
	<div class="relative flex-1">
		<div class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
			{#if isLoading}
				<LoaderCircleIcon class="size-4 animate-spin" />
			{:else}
				<SearchIcon class="size-4" />
			{/if}
		</div>
		<Input
			type="text"
			placeholder={searchPlaceholder}
			value={search}
			oninput={(event) => setSearch(event.currentTarget.value)}
			class="bg-background pr-9 pl-9"
		/>
		{#if search}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<ClearButton onclick={() => setSearch('')} aria-label={m.transactions_clear_search()} />
			</div>
		{/if}
	</div>
	{#if period}
		<Popover.Root bind:open={periodPopoverOpen}>
			<Popover.SelectTrigger
				aria-label={m.transactions_filter_period_label()}
				class="bg-background w-full sm:w-fit"
			>
				<span class="truncate">{periodTriggerText}</span>
			</Popover.SelectTrigger>
			<Popover.Content class="w-auto p-0" align="start" collisionPadding={32}>
				<div class="flex">
					<div class="flex flex-col border-r p-2">
						{#each periodOptions ?? [] as option (option)}
							<Button
								variant="ghost"
								class="data-[selected]:bg-accent data-[selected]:text-accent-foreground justify-start font-normal"
								data-selected={!customRange && period === option ? '' : undefined}
								onclick={() => {
									setPresetPeriod?.(option);
									periodPopoverOpen = false;
								}}
							>
								{periodLabels[option]()}
							</Button>
						{/each}
					</div>
					<div class="p-2">
						<RangeCalendar
							value={calendarValue}
							onValueChange={(value) => {
								if (!value?.start || !value?.end) return;
								setCustomRange?.(
									new Date(Date.UTC(value.start.year, value.start.month - 1, value.start.day)),
									addDays(new Date(Date.UTC(value.end.year, value.end.month - 1, value.end.day)), 1)
								);
								periodPopoverOpen = false;
							}}
							numberOfMonths={2}
							placeholder={calendarValue?.start}
							disableDaysOutsideMonth
						/>
					</div>
				</div>
			</Popover.Content>
		</Popover.Root>
	{/if}
	{@render controls()}
</div>
