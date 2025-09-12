<script lang="ts">
	import { getCashflowContext } from '$lib/cashflow.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index';

	const cashflow = getCashflowContext();
	const avg3m = $derived.by(() => cashflow.avg3m);
	const avg6m = $derived.by(() => cashflow.avg6m);
	const avgYtd = $derived.by(() => cashflow.avgYtd);
	const avg1y = $derived.by(() => cashflow.avg1y);
</script>

<Tabs.Root value="six-months">
	<nav class="flex items-center justify-between space-x-2">
		<SectionTitle title="Trailing cashflow" />

		<Tabs.List>
			<Tabs.Trigger value="three-months">3M</Tabs.Trigger>
			<Tabs.Trigger value="six-months">6M</Tabs.Trigger>
			<Tabs.Trigger value="year-to-date">YTD</Tabs.Trigger>
			<Tabs.Trigger value="one-year">1Y</Tabs.Trigger>
		</Tabs.List>
	</nav>

	<Tabs.Content value="three-months">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue title="Income per month" value={avg3m.income} />
			<KeyValue title="Expenses per month" value={Math.abs(avg3m.expenses)} />
			<KeyValue title="Surplus per month" value={avg3m.surplus} />
		</div>
	</Tabs.Content>

	<Tabs.Content value="six-months">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue title="Income per month" value={avg6m.income} />
			<KeyValue title="Expenses per month" value={Math.abs(avg6m.expenses)} />
			<KeyValue title="Surplus per month" value={avg6m.surplus} />
		</div>
	</Tabs.Content>

	<Tabs.Content value="year-to-date">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue title="Income per month" value={avgYtd.income} />
			<KeyValue title="Expenses per month" value={Math.abs(avgYtd.expenses)} />
			<KeyValue title="Surplus per month" value={avgYtd.surplus} />
		</div>
	</Tabs.Content>

	<Tabs.Content value="one-year">
		<div class="grid gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
			<KeyValue title="Income per month" value={avg1y.income} />
			<KeyValue title="Expenses per month" value={Math.abs(avg1y.expenses)} />
			<KeyValue title="Surplus per month" value={avg1y.surplus} />
		</div>
	</Tabs.Content>
</Tabs.Root>
