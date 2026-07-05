<script lang="ts">
	import type { CashflowAverages } from '$lib/cashflow-utils';
	import KeyValue from '$lib/components/key-value.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';

	let {
		avg3m,
		avg6m,
		avgYtd,
		avg1y,
		title = m.trailing_cashflow_section_title()
	}: {
		avg3m: CashflowAverages;
		avg6m: CashflowAverages;
		avgYtd: CashflowAverages;
		avg1y: CashflowAverages;
		title?: string;
	} = $props();
</script>

<Tabs.Root value="six-months">
	<nav class="flex items-center justify-between space-x-2">
		<SectionTitle {title} />

		<Tabs.List>
			<Tabs.Trigger value="three-months">{m.period_3m_label()}</Tabs.Trigger>
			<Tabs.Trigger value="six-months">{m.period_6m_label()}</Tabs.Trigger>
			<Tabs.Trigger value="year-to-date">{m.period_ytd_label()}</Tabs.Trigger>
			<Tabs.Trigger value="one-year">{m.period_1y_label()}</Tabs.Trigger>
		</Tabs.List>
	</nav>

	<Tabs.Content value="three-months">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue
				title={m.trailing_cashflow_income_label()}
				value={avg3m.income}
				isUnconverted={avg3m.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_expenses_label()}
				value={Math.abs(avg3m.expenses)}
				isUnconverted={avg3m.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_surplus_label()}
				value={avg3m.surplus}
				isUnconverted={avg3m.isUnconverted}
			/>
		</div>
	</Tabs.Content>

	<Tabs.Content value="six-months">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue
				title={m.trailing_cashflow_income_label()}
				value={avg6m.income}
				isUnconverted={avg6m.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_expenses_label()}
				value={Math.abs(avg6m.expenses)}
				isUnconverted={avg6m.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_surplus_label()}
				value={avg6m.surplus}
				isUnconverted={avg6m.isUnconverted}
			/>
		</div>
	</Tabs.Content>

	<Tabs.Content value="year-to-date">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue
				title={m.trailing_cashflow_income_label()}
				value={avgYtd.income}
				isUnconverted={avgYtd.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_expenses_label()}
				value={Math.abs(avgYtd.expenses)}
				isUnconverted={avgYtd.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_surplus_label()}
				value={avgYtd.surplus}
				isUnconverted={avgYtd.isUnconverted}
			/>
		</div>
	</Tabs.Content>

	<Tabs.Content value="one-year">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue
				title={m.trailing_cashflow_income_label()}
				value={avg1y.income}
				isUnconverted={avg1y.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_expenses_label()}
				value={Math.abs(avg1y.expenses)}
				isUnconverted={avg1y.isUnconverted}
			/>
			<KeyValue
				title={m.trailing_cashflow_surplus_label()}
				value={avg1y.surplus}
				isUnconverted={avg1y.isUnconverted}
			/>
		</div>
	</Tabs.Content>
</Tabs.Root>
