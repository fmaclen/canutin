<script module lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { startOfDay, startOfYear, subMonths, subYears } from 'date-fns';

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

	// Windows a precomputed daily series to a period: charts compute their full-range rows once
	// and reslice on every chooser change. `maxStart` anchors the MAX tab (e.g. the earliest
	// balance date); null means MAX keeps every row.
	export function slicePeriodRows<T extends { date: Date }>(
		rows: T[],
		period: PeriodKey,
		maxStart: Date | null
	) {
		const start = period === 'max' ? maxStart : computeBoundedHistoryStart(period);
		if (!start) return rows;
		return rows.filter((row) => row.date >= start);
	}
</script>

<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';

	let { value = $bindable(), label }: { value: PeriodKey; label: string } = $props();
</script>

<Tabs.Root bind:value>
	<Tabs.List aria-label={label}>
		<Tabs.Trigger value="3m">{m.period_3m_label()}</Tabs.Trigger>
		<Tabs.Trigger value="6m">{m.period_6m_label()}</Tabs.Trigger>
		<Tabs.Trigger value="ytd">{m.period_ytd_label()}</Tabs.Trigger>
		<Tabs.Trigger value="1y">{m.period_1y_label()}</Tabs.Trigger>
		<Tabs.Trigger value="2y">{m.period_2y_label()}</Tabs.Trigger>
		<Tabs.Trigger value="5y">{m.period_5y_label()}</Tabs.Trigger>
		<Tabs.Trigger value="max">{m.period_max_label()}</Tabs.Trigger>
	</Tabs.List>
</Tabs.Root>
