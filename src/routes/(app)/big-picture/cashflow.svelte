<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3-scale';
	import { format } from 'date-fns';
	import { BarChart, Tooltip } from 'layerchart';

	import { goto } from '$app/navigation';
	import { getCashflowContext, type CashflowPeriod } from '$lib/cashflow.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import Currency from '$lib/components/currency.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Chart from '$lib/components/ui/chart/index';

	const cashflow = getCashflowContext();
	const periods = $derived(cashflow.periods);

	// Use CSS variable colors
	const COLOR_CASH = '#00a36f';
	const COLOR_DEBT = '#e75258';

	// Transform data for the chart - split positive/negative for different colors
	const chartData = $derived(
		periods.map((p) => {
			const isJanuary = p.month.getMonth() === 0;
			return {
				...p,
				// Make label unique - include year for January to avoid duplicate x-axis keys
				label: isJanuary ? `Jan '${format(p.month, 'yy')}` : format(p.month, 'MMM'),
				positive: p.surplus > 0 ? p.surplus : 0,
				negative: p.surplus < 0 ? p.surplus : 0
			};
		})
	);

	// Calculate y domain to include 0 and have padding
	const yDomain = $derived.by(() => {
		if (!periods.length) return [-100, 100] as [number, number];
		const surpluses = periods.map((p) => p.surplus);
		const min = Math.min(0, ...surpluses);
		const max = Math.max(0, ...surpluses);
		const padding = Math.max(Math.abs(max), Math.abs(min)) * 0.15;
		return [min - padding, max + padding] as [number, number];
	});

	const chartConfig = {
		positive: { label: 'Balance', color: COLOR_CASH },
		negative: { label: 'Balance', color: COLOR_DEBT }
	} satisfies Chart.ChartConfig;

	function handleBarClick(event: MouseEvent, detail: { data: CashflowPeriod }) {
		const period = detail.data;
		goto(
			`/transactions?periodFrom=${period.periodFrom}&periodTo=${period.periodTo}&periodLabel=${encodeURIComponent(period.periodLabel)}`
		);
	}
</script>

<div class="flex flex-col gap-4">
	<SectionTitle title="Cashflow" />

	<div class="bg-background overflow-hidden rounded-md shadow-sm">
		{#if chartData.length > 0}
			<Chart.Container
				config={chartConfig}
				class="h-80 w-full [&_.lc-axis-y]:hidden [&_.lc-bar]:stroke-none [&_.lc-grid]:hidden"
			>
				<BarChart
					data={chartData}
					x="label"
					xScale={scaleBand().padding(0.2)}
					yScale={scaleLinear()}
					{yDomain}
					yBaseline={0}
					padding={{ top: 40, right: 16, bottom: 32, left: 16 }}
					onBarClick={handleBarClick}
					series={[
						{ key: 'positive', color: COLOR_CASH },
						{ key: 'negative', color: COLOR_DEBT }
					]}
					seriesLayout="overlap"
					props={{
						bars: { radius: 0 },
						xAxis: { format: (v: string) => v },
						yAxis: { ticks: 0 }
					}}
				>
					{#snippet tooltip()}
						<Tooltip.Root variant="none">
							{#snippet children({ data }: { data: CashflowPeriod })}
								<div
									class="border-border/50 bg-background grid min-w-36 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
								>
									<div class="text-muted-foreground border-b pb-1">
										{data.periodLabel}
									</div>
									<div class="flex items-center justify-between gap-4">
										<span class="text-muted-foreground">Income</span>
										<Currency value={data.income} />
									</div>
									<div class="flex items-center justify-between gap-4">
										<span class="text-muted-foreground">Expenses</span>
										<Currency value={Math.abs(data.expenses)} />
									</div>
									<div class="flex items-center justify-between gap-4 border-t pt-1">
										<span class="text-muted-foreground">Balance</span>
										<Currency value={data.surplus} />
									</div>
								</div>
							{/snippet}
						</Tooltip.Root>
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/if}
	</div>
</div>
