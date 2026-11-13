<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { addDays, subDays } from 'date-fns';
	import type { Snippet } from 'svelte';

	import ClearButton from '$lib/components/clear-button.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
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
	// Two months side by side can't fit a phone, so there the presets live in the same select as the
	// other filters and "Custom range" opens a sheet with one month. The sheet keeps a draft range
	// that only applies on Apply, so a mistapped day can be corrected first.
	const isMobile = new IsMobile();
	const CUSTOM_RANGE = 'custom';
	let customRangeSheetOpen = $state(false);
	let draftStart = $state<DateValue>();
	let draftEnd = $state<DateValue>();

	function selectRange(value: { start?: DateValue; end?: DateValue } | undefined) {
		if (!value?.start || !value?.end) return;
		setCustomRange?.(
			new Date(Date.UTC(value.start.year, value.start.month - 1, value.start.day)),
			addDays(new Date(Date.UTC(value.end.year, value.end.month - 1, value.end.day)), 1)
		);
		periodPopoverOpen = false;
		customRangeSheetOpen = false;
	}

	function openCustomRangeSheet() {
		draftStart = calendarValue?.start;
		draftEnd = calendarValue?.end;
		customRangeSheetOpen = true;
	}

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

<div class="flex flex-col gap-2 max-sm:mb-3.5 sm:flex-row sm:items-center">
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
			<!-- The X glyph is drawn smaller within its box than the magnifier, so it sits 2px nearer
			     the edge to look as far in from the right as the magnifier is from the left -->
			<div class="absolute top-1/2 right-2.5 -translate-y-1/2">
				<ClearButton onclick={() => setSearch('')} aria-label={m.transactions_clear_search()} />
			</div>
		{/if}
	</div>
	<!-- With a period picker there are four filters, laid out two by two on phones so they don't
	     stack into a tall column; above `sm` the wrapper dissolves and they join the search row -->
	<div class={['grid gap-2 sm:contents [&>*]:min-w-0', period ? 'grid-cols-2' : 'grid-cols-1']}>
		{#if period && isMobile.current}
			<Select.Root
				type="single"
				bind:value={
					() => (customRange ? CUSTOM_RANGE : period),
					(value) => {
						if (value === CUSTOM_RANGE) openCustomRangeSheet();
						else setPresetPeriod?.(value as PeriodOption);
					}
				}
			>
				<Select.Trigger
					aria-label={m.transactions_filter_period_label()}
					class="bg-background w-full"
				>
					<span class="truncate">{periodTriggerText}</span>
				</Select.Trigger>
				<Select.Content>
					{#each periodOptions ?? [] as option (option)}
						<Select.Item value={option}>{periodLabels[option]()}</Select.Item>
					{/each}
					<!-- Picking the active custom range again doesn't change the select's value, so the
					     sheet also opens from the tap itself to let that range be adjusted -->
					<Select.Item value={CUSTOM_RANGE} onclick={openCustomRangeSheet}>
						{m.transactions_filter_period_custom()}
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<Sheet.Root bind:open={customRangeSheetOpen}>
				<Sheet.Content side="bottom" class="gap-0">
					<Sheet.Header class="border-b px-4 py-3">
						<Sheet.Title>{m.transactions_filter_period_custom()}</Sheet.Title>
					</Sheet.Header>
					<dl class="grid grid-cols-2 border-b text-sm">
						{#each [{ label: m.transactions_filter_period_start(), value: draftStart }, { label: m.transactions_filter_period_end(), value: draftEnd }] as bound, index (index)}
							<div class={['flex flex-col gap-1 px-4 py-3', index === 0 && 'border-r']}>
								<dt class="text-muted-foreground">{bound.label}</dt>
								<dd class={bound.value ? 'font-mono' : 'text-muted-foreground'}>
									{bound.value?.toString() ?? m.transactions_filter_period_pick_day()}
								</dd>
							</div>
						{/each}
					</dl>
					<RangeCalendar
						value={calendarValue}
						onStartValueChange={(value) => (draftStart = value)}
						onEndValueChange={(value) => (draftEnd = value)}
						numberOfMonths={1}
						placeholder={calendarValue?.start}
						disableDaysOutsideMonth
						class="w-full [--cell-size:calc((100vw-(--spacing(6)))/7)]"
					/>
					<footer
						class="border-border bg-border flex justify-end border-t px-4 pt-2 pb-[calc(--spacing(2)+env(safe-area-inset-bottom))]"
					>
						<Button
							disabled={!draftStart || !draftEnd}
							onclick={() => selectRange({ start: draftStart, end: draftEnd })}
						>
							{m.transactions_filter_period_apply()}
						</Button>
					</footer>
				</Sheet.Content>
			</Sheet.Root>
		{:else if period}
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
								onValueChange={selectRange}
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
</div>
