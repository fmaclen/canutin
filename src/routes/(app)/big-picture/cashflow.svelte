<script lang="ts">
	import { format } from 'date-fns';

	import { getCashflowContext } from '$lib/cashflow.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	const cashflow = getCashflowContext();
	const periods = $derived(cashflow.periods);

	// Minimum bar height in pixels
	const MIN_BAR_HEIGHT = 3;

	// Track hovered period index
	let hoveredIndex = $state<number | null>(null);

	// Transform data for the chart - split positive/negative for different colors
	const chartData = $derived.by(() =>
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

	// Calculate zero line position as percentage from top
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
</script>

<SectionTitle title="Cashflow" />

<div class="bg-background relative overflow-hidden rounded-md shadow-md">
	{#if chartData.length > 0}
		<Tooltip.Provider>
			<!-- Grid layout: columns for each period -->
			<div class="grid" style="grid-template-columns: repeat({chartData.length}, minmax(0, 1fr));">
				{#each chartData as period, i (period.id)}
					{@const barData = barHeights[i]}
					{@const isPositive = barData.isPositive}
					{@const heightPercent = barData.height}
					{@const isHovered = hoveredIndex === i}
					<Tooltip.Root delayDuration={50}>
						<Tooltip.Trigger
							class="relative flex h-80 flex-col pt-2 sm:pt-8 {i < chartData.length - 1
								? 'border-border border-r'
								: ''} {isHovered ? 'bg-muted/50' : ''}"
							onmouseenter={() => (hoveredIndex = i)}
							onmouseleave={() => (hoveredIndex = null)}
						>
							<!-- Chart area -->
							<div class="relative flex-1">
								<!-- Inner container for bars, inset to leave room for labels -->
								<div class="absolute inset-x-0 top-0 bottom-0 sm:bottom-8">
									{#if period.surplus !== 0}
										{#if isPositive}
											<div
												class="absolute right-0 left-0 border-t-3 border-t-[#00a36f] transition-all duration-200 ease-out {isHovered
													? 'bg-[#00a36f]'
													: 'bg-[hsl(166,52%,95%)]'}"
												style="
											top: calc({zeroLinePercent}% - max({MIN_BAR_HEIGHT}px, {heightPercent}%));
											height: max({MIN_BAR_HEIGHT}px, {heightPercent}%);
										"
											>
												<!-- Value label (positive) -->
												{#if shouldShowLabel(i)}
													<span
														class="pointer-events-none absolute right-0 bottom-full left-0 hidden truncate p-2 text-center font-mono text-xs font-medium text-[#00a36f] sm:block"
													>
														{formatCurrency(period.surplus)}
													</span>
												{/if}
											</div>
										{:else}
											<div
												class="absolute right-0 left-0 border-b-3 border-b-[#e75258] transition-all duration-200 ease-out {isHovered
													? 'bg-[#e75258]'
													: 'bg-[hsl(346,52%,95%)]'}"
												style="
											top: {zeroLinePercent}%;
											height: max({MIN_BAR_HEIGHT}px, {heightPercent}%);
										"
											>
												<!-- Value label (negative) -->
												{#if shouldShowLabel(i)}
													<span
														class="pointer-events-none absolute top-full right-0 left-0 hidden truncate p-2 text-center font-mono text-xs font-medium text-[#e75258] sm:block"
													>
														{formatCurrency(period.surplus)}
													</span>
												{/if}
											</div>
										{/if}
									{/if}
									<!-- Zero line -->
									<div
										class="border-border pointer-events-none absolute right-0 left-0 border-t"
										style="top: {zeroLinePercent}%"
									></div>
								</div>
							</div>

							<!-- X-axis label -->
							<div class="text-muted-foreground flex h-8 items-center justify-center text-xs">
								{period.label}
							</div>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<div class="flex flex-col gap-1">
								<div class="font-semibold">{period.periodLabel}</div>
								<div class="flex items-center justify-between gap-4">
									<span class="flex items-center gap-1.5">
										<span class="size-2 rounded-full border border-[#00a36f]"></span>
										Income
									</span>
									<span class="font-mono">{formatCurrency(period.income)}</span>
								</div>
								<div class="flex items-center justify-between gap-4">
									<span class="flex items-center gap-1.5">
										<span class="size-2 rounded-full border border-[#e75258]"></span>
										Expenses
									</span>
									<span class="font-mono">{formatCurrency(period.expenses)}</span>
								</div>
								<div class="flex items-center justify-between gap-4">
									<span class="flex items-center gap-1.5">
										<span
											class="size-2 rounded-full {period.surplus >= 0
												? 'bg-[#00a36f]'
												: 'bg-[#e75258]'}"
										></span>
										Surplus
									</span>
									<span class="font-mono">{formatCurrency(period.surplus)}</span>
								</div>
							</div>
						</Tooltip.Content>
					</Tooltip.Root>
				{/each}
			</div>
		</Tooltip.Provider>
	{/if}
</div>
