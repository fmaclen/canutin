<script module lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { isSameWeek, startOfDay, startOfYear, subMonths, subYears } from 'date-fns';

	export type PeriodKey = '3m' | '6m' | 'ytd' | '1y' | '2y' | '5y' | 'max';

	export function computeBoundedHistoryStart(period: PeriodKey) {
		const now = startOfDay(new UTCDate());
		if (period === '3m') return subMonths(now, 3);
		if (period === '6m') return subMonths(now, 6);
		if (period === 'ytd') return startOfYear(now);
		if (period === '1y') return subYears(now, 1);
		if (period === '2y') return subYears(now, 2);
		if (period === '5y') return subYears(now, 5);
		return null;
	}

	// Above this row count a window renders more points than pixels, so it thins to weekly
	// resolution. Bounded windows up to 1Y (~367 daily rows) always pass through untouched.
	const DOWNSAMPLE_THRESHOLD = 400;

	// Windows a precomputed daily series to a period: charts compute their full-range rows once
	// and reslice on every chooser change. `maxStart` anchors the MAX tab (e.g. the earliest
	// balance date); null means MAX keeps every row.
	export function slicePeriodRows<T extends { date: Date }>(
		rows: T[],
		period: PeriodKey,
		maxStart: Date | null
	) {
		const start = period === 'max' ? maxStart : computeBoundedHistoryStart(period);
		const sliced = start ? rows.filter((row) => row.date >= start) : rows;
		if (sliced.length <= DOWNSAMPLE_THRESHOLD) return sliced;
		// Balances are state-as-of series, so each week's LAST row is its honest representative
		// (never an average). The window's first and final rows always survive so the range
		// anchors and today's value stay exact.
		return sliced.filter(
			(row, index) =>
				index === 0 || index === sliced.length - 1 || !isSameWeek(row.date, sliced[index + 1].date)
		);
	}
</script>

<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';

	let { value = $bindable(), label }: { value: PeriodKey; label: string } = $props();
</script>

<Tabs.Root bind:value class="w-full max-sm:mb-1.5 sm:w-fit">
	<Tabs.List class="w-full sm:w-fit" aria-label={label}>
		<Tabs.Trigger value="3m">{m.period_3m_label()}</Tabs.Trigger>
		<Tabs.Trigger value="6m">{m.period_6m_label()}</Tabs.Trigger>
		<Tabs.Trigger value="ytd">{m.period_ytd_label()}</Tabs.Trigger>
		<Tabs.Trigger value="1y">{m.period_1y_label()}</Tabs.Trigger>
		<Tabs.Trigger value="2y">{m.period_2y_label()}</Tabs.Trigger>
		<Tabs.Trigger value="5y">{m.period_5y_label()}</Tabs.Trigger>
		<Tabs.Trigger value="max">{m.period_max_label()}</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
