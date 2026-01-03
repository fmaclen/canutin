<script lang="ts">
	import { format } from 'date-fns';

	import { goto } from '$app/navigation';
	import { getCashflowContext, type CashflowPeriod } from '$lib/cashflow.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import SectionTitle from '$lib/components/section-title.svelte';

	const cashflow = getCashflowContext();
	const periods = $derived(cashflow.periods);

	// Minimum bar height in pixels
	const MIN_BAR_HEIGHT = 3;

	// Track hovered period index
	let hoveredIndex = $state<number | null>(null);

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

	// Calculate y domain to include 0 with no padding
	const yDomain = $derived.by(() => {
		if (!periods.length) return [-100, 100] as [number, number];
		const surpluses = periods.map((p) => p.surplus);
		const min = Math.min(0, ...surpluses);
		const max = Math.max(0, ...surpluses);
		return [min, max] as [number, number];
	});

	// Calculate zero line position as percentage from top (accounting for 32px bottom padding)
	const zeroLinePercent = $derived.by(() => {
		const [min, max] = yDomain;
		const range = max - min;
		if (range === 0) return 50;
		return ((max - 0) / range) * 100;
	});

	// Calculate bar heights as percentages, with minimum height enforcement
	const barHeights = $derived.by(() => {
		const [min, max] = yDomain;
		const range = max - min;
		if (range === 0) return periods.map(() => ({ height: 0, isPositive: true }));

		return periods.map((p) => {
			const absValue = Math.abs(p.surplus);
			const heightPercent = (absValue / range) * 100;
			return {
				height: heightPercent,
				isPositive: p.surplus >= 0
			};
		});
	});

	// Find indices of highest and lowest surplus values
	const extremeIndices = $derived.by(() => {
		if (!periods.length) return { highestIndex: -1, lowestIndex: -1 };

		let highestIndex = 0;
		let lowestIndex = 0;
		let highest = periods[0].surplus;
		let lowest = periods[0].surplus;

		periods.forEach((p, i) => {
			if (p.surplus > highest) {
				highest = p.surplus;
				highestIndex = i;
			}
			if (p.surplus < lowest) {
				lowest = p.surplus;
				lowestIndex = i;
			}
		});

		return { highestIndex, lowestIndex };
	});

	// Determine which bars should show their value label
	function shouldShowLabel(index: number): boolean {
		if (hoveredIndex === index) return true;
		if (index === extremeIndices.highestIndex && periods[index].surplus > 0) return true;
		if (index === extremeIndices.lowestIndex && periods[index].surplus < 0) return true;
		return false;
	}

	function handleBarClick(_event: MouseEvent, detail: { data: CashflowPeriod }) {
		const period = detail.data;
		const url = `/transactions?periodFrom=${period.periodFrom}&periodTo=${period.periodTo}&periodLabel=${encodeURIComponent(period.periodLabel)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(url);
	}
</script>

<div class="flex flex-col gap-4">
	<SectionTitle title="Cashflow" />

	<div class="bg-background relative overflow-hidden rounded-md shadow-sm">
		{#if chartData.length > 0}
			<!-- Custom bar chart with styled bars -->
			<div class="relative flex h-80 flex-col pt-5">
				<!-- Vertical divider lines (full height including labels) -->
				<div
					class="pointer-events-none absolute inset-0 z-10 grid"
					style="grid-template-columns: repeat({chartData.length}, 1fr);"
				>
					{#each chartData as period, i (period.id)}
						<div class={i < chartData.length - 1 ? 'border-border border-r' : ''}></div>
					{/each}
				</div>
				<!-- Chart area -->
				<div class="relative flex-1">
					<!-- Bars container -->
					<div
						class="absolute top-0 right-0 bottom-5 left-0 grid"
						style="grid-template-columns: repeat({chartData.length}, 1fr);"
					>
						{#each chartData as period, i (period.id)}
							{@const barData = barHeights[i]}
							{@const isPositive = barData.isPositive}
							{@const heightPercent = barData.height}
							<button
								type="button"
								class="group relative cursor-pointer"
								onclick={(e) => handleBarClick(e, { data: period })}
								onmouseenter={() => (hoveredIndex = i)}
								onmouseleave={() => (hoveredIndex = null)}
								title="See transactions in {period.periodLabel}"
							>
								<!-- Bar with secondary fill, primary on hover -->
								{#if period.surplus !== 0}
									{#if isPositive}
										<!-- Positive bar: anchored at zero line, grows upward -->
										<div
											class="absolute right-0 left-0 border-t-3 border-t-[#00a36f] bg-[hsl(166,52%,95%)] group-hover:bg-[#00a36f]"
											style="
												top: calc({zeroLinePercent}% - max({MIN_BAR_HEIGHT}px, {heightPercent}%));
												height: max({MIN_BAR_HEIGHT}px, {heightPercent}%);
											"
										>
											<!-- Value label -->
											{#if shouldShowLabel(i)}
												<span
													class="pointer-events-none absolute right-0 bottom-[calc(100%+4px)] left-0 truncate text-center font-mono text-xs font-medium text-[#00a36f]"
												>
													{formatCurrency(period.surplus)}
												</span>
											{/if}
										</div>
									{:else}
										<!-- Negative bar: anchored at zero line, grows downward -->
										<div
											class="absolute right-0 left-0 border-b-3 border-b-[#e75258] bg-[hsl(346,52%,95%)] group-hover:bg-[#e75258]"
											style="
												top: {zeroLinePercent}%;
												height: max({MIN_BAR_HEIGHT}px, {heightPercent}%);
											"
										>
											<!-- Value label -->
											{#if shouldShowLabel(i)}
												<span
													class="pointer-events-none absolute top-[calc(100%+4px)] right-0 left-0 truncate text-center font-mono text-xs font-medium text-[#e75258]"
												>
													{formatCurrency(period.surplus)}
												</span>
											{/if}
										</div>
									{/if}
								{/if}
							</button>
						{/each}
					</div>
					<!-- Horizontal zero line -->
					<div
						class="border-border pointer-events-none absolute right-0 left-0 z-10 border-t"
						style="top: {zeroLinePercent}%"
					></div>
				</div>
				<!-- X-axis labels -->
				<div
					class="grid h-8 items-center"
					style="grid-template-columns: repeat({chartData.length}, 1fr);"
				>
					{#each chartData as period (period.id)}
						<div class="text-muted-foreground text-center text-xs">{period.label}</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
