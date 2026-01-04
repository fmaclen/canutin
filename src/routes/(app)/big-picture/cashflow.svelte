<script lang="ts">
	import { addMonths, format } from 'date-fns';

	import { getCashflowContext } from '$lib/cashflow.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';

	const cashflow = getCashflowContext();
	const periods = $derived(cashflow.periods);

	let hoveredIndex = $state<number | null>(null);

	const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
	const yearFormatter = new Intl.DateTimeFormat(undefined, { year: '2-digit', timeZone: 'UTC' });

	const chartData = $derived.by(() =>
		periods.map((p) => {
			const isJanuary = p.month.getMonth() === 0;
			const month = monthFormatter.format(p.month);
			const periodFrom = format(p.month, 'yyyy-MM-dd');
			const periodTo = format(addMonths(p.month, 1), 'yyyy-MM-dd');
			const periodLabel = encodeURIComponent(p.periodLabel);
			return {
				...p,
				label: isJanuary ? `${month} '${yearFormatter.format(p.month)}` : month,
				transactionsUrl: `/transactions?periodFrom=${periodFrom}&periodTo=${periodTo}&periodLabel=${periodLabel}`
			};
		})
	);

	const chartRatios = $derived.by(() => {
		if (!periods.length) {
			return { positiveRatio: 1, negativeRatio: 1, highestSurplus: 0, lowestSurplus: 0 };
		}

		// Get highest positive surplus
		const positiveSurpluses = periods.filter((p) => p.surplus > 0).map((p) => p.surplus);
		const highestSurplus = positiveSurpluses.length > 0 ? Math.max(...positiveSurpluses) : 0;

		// Get lowest negative surplus
		const negativeSurpluses = periods.filter((p) => p.surplus < 0).map((p) => p.surplus);
		const lowestSurplus = negativeSurpluses.length > 0 ? Math.min(...negativeSurpluses) : 0;

		// Calculate the range and initial ratios
		const surplusRange = highestSurplus + Math.abs(lowestSurplus);

		// proportionBetween: (a * 100) / b, or 0 if either is 0
		const proportionBetween = (num1: number, num2: number) => {
			return num1 !== 0 && num2 !== 0 ? Math.round(((num1 * 100) / num2) * 100) / 100 : 0;
		};

		let positiveRatio = proportionBetween(highestSurplus, surplusRange);
		let negativeRatio = proportionBetween(Math.abs(lowestSurplus), surplusRange);

		// Normalize so the larger ratio is relative to 1
		if (positiveRatio > negativeRatio) {
			const isNegativeRatioZero = negativeRatio === 0;
			positiveRatio = isNegativeRatioZero ? 1 : positiveRatio / negativeRatio;
			negativeRatio = isNegativeRatioZero ? 0 : 1;
		} else {
			const isPositiveRatioZero = positiveRatio === 0;
			negativeRatio = isPositiveRatioZero ? 1 : negativeRatio / positiveRatio;
			positiveRatio = isPositiveRatioZero ? 0 : 1;
		}

		// Handle edge case where both are equal (e.g., all zeros)
		if (positiveRatio === negativeRatio) {
			positiveRatio = 1;
			negativeRatio = 1;
		}

		return { positiveRatio, negativeRatio, highestSurplus, lowestSurplus };
	});

	// Calculate bar height as percentage within its zone
	function getBarHeight(surplus: number) {
		if (surplus === 0) return 0;

		const { highestSurplus, lowestSurplus } = chartRatios;

		if (surplus > 0) {
			return highestSurplus !== 0 ? (surplus / highestSurplus) * 100 : 0;
		} else {
			return lowestSurplus !== 0 ? (Math.abs(surplus) / Math.abs(lowestSurplus)) * 100 : 0;
		}
	}

	const extremeIndices = $derived.by(() => {
		if (!periods.length) return { highestIndex: null, lowestIndex: null };
		const surpluses = periods.map((p) => p.surplus);
		return {
			highestIndex: surpluses.indexOf(Math.max(...surpluses)),
			lowestIndex: surpluses.indexOf(Math.min(...surpluses))
		};
	});

	function shouldShowLabel(index: number): boolean {
		if (hoveredIndex === index) return true;
		if (periods[index].isCurrentPeriod && periods[index].surplus !== 0) return true;
		if (index === extremeIndices.highestIndex && periods[index].surplus > 0) return true;
		if (index === extremeIndices.lowestIndex && periods[index].surplus < 0) return true;
		return false;
	}
</script>

<SectionTitle title={m.cashflow_section_title()} />

<div class="bg-background overflow-hidden rounded-md shadow-md">
	{#if chartData.length > 0}
		<Tooltip.Provider>
			<!-- Outer grid: one column per period -->
			<div class="grid" style="grid-template-columns: repeat({chartData.length}, minmax(0, 1fr));">
				{#each chartData as period, i (period.id)}
					{@const isHovered = hoveredIndex === i}
					{@const isDecember = period.month.getMonth() === 11}
					{@const isLastColumn = i === chartData.length - 1}
					{@const isPositive = period.surplus > 0}
					{@const isNegative = period.surplus < 0}
					{@const barHeight = getBarHeight(period.surplus)}
					{@const isCurrentPeriod = period.isCurrentPeriod}
					{@const trend = isPositive ? 'positive' : isNegative ? 'negative' : null}

					<Tooltip.Root delayDuration={50}>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									{...props}
									href={period.transactionsUrl}
									aria-label="{period.periodLabel}: {formatCurrency(period.surplus)}"
									class="flex flex-col pt-2 {!isLastColumn
										? isDecember
											? 'border-border border-r border-dashed'
											: 'border-border border-r'
										: ''} {isHovered ? 'bg-muted/50' : ''}"
									onmouseenter={() => (hoveredIndex = i)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<!-- Chart area: match old design height (50vh, min 256px, max 320px, 32px padding) -->
									<div
										class="box-border grid h-[50vh] max-h-80 min-h-64 py-7"
										style="grid-template-rows: {chartRatios.positiveRatio}fr 1px {chartRatios.negativeRatio}fr;"
									>
										<!-- Negative trend: placeholder, hr, then bar -->
										{#if trend === 'negative'}
											<div></div>
											<hr class="bg-border m-0 h-px border-none" />
										{/if}

										<!-- The bar zone (positive or negative) -->
										{#if trend === 'positive' || trend === 'negative'}
											<div
												class="flex flex-col {trend === 'positive' ? 'text-cash' : 'text-debt'}"
												style="height: 100%;"
											>
												<div
													class="relative box-content transition-colors duration-200
												{trend === 'positive' ? 'border-t-cash mt-auto border-t-3' : 'border-b-debt mb-auto border-b-3'}
												{isCurrentPeriod
														? ''
														: isHovered
															? trend === 'positive'
																? 'bg-cash'
																: 'bg-debt'
															: trend === 'positive'
																? 'bg-cash/10'
																: 'bg-debt/10'}"
													style="height: {barHeight}%; {isCurrentPeriod
														? 'background-image: url(/chart-current-background.svg);'
														: ''}"
												>
													<!-- Label positioned outside the bar -->
													<p
														class="pointer-events-none absolute m-0 hidden w-full overflow-hidden px-1 text-center font-mono text-ellipsis sm:block
													{trend === 'positive' ? 'bottom-full pb-2' : 'top-full pt-2'}
													{shouldShowLabel(i) ? 'opacity-100' : 'opacity-0'}"
													>
														{formatCurrency(period.surplus)}
													</p>
												</div>
											</div>
										{:else}
											<!-- No trend (zero): placeholder, hr, placeholder -->
											<div></div>
											<hr class="bg-border m-0 h-px border-none" />
											<div></div>
										{/if}

										<!-- Positive trend: hr, then placeholder -->
										{#if trend === 'positive'}
											<hr class="bg-border m-0 h-px border-none" />
											<div></div>
										{/if}
									</div>

									<!-- X-axis label -->
									<div class="text-muted-foreground flex h-8 items-center justify-center text-xs">
										{period.label}
									</div>
								</a>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>
							<div class="flex flex-col gap-1">
								<div class="font-semibold">{period.periodLabel}</div>
								<div class="flex items-center justify-between gap-4">
									<span class="flex items-center gap-1.5">
										<span class="border-cash size-2 rounded-full border"></span>
										{m.cashflow_income_label()}
									</span>
									<span class="font-mono">{formatCurrency(period.income)}</span>
								</div>
								<div class="flex items-center justify-between gap-4">
									<span class="flex items-center gap-1.5">
										<span class="border-debt size-2 rounded-full border"></span>
										{m.cashflow_expenses_label()}
									</span>
									<span class="font-mono">{formatCurrency(period.expenses)}</span>
								</div>
								<div class="flex items-center justify-between gap-4">
									<span class="flex items-center gap-1.5">
										<span class="size-2 rounded-full {period.surplus >= 0 ? 'bg-cash' : 'bg-debt'}"
										></span>
										{m.cashflow_surplus_label()}
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
