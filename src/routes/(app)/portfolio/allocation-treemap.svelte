<script lang="ts">
	import { hierarchy } from 'd3-hierarchy';
	import { ChartCore } from 'layerchart';
	import { Treemap } from 'layerchart/hierarchy';

	import { resolve } from '$app/paths';
	import { formatCurrency } from '$lib/components/currency';
	import Currency from '$lib/components/currency.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SecurityAggregate } from '$lib/securities.svelte';
	import { gainLossPercentOrNull, sentiment } from '$lib/security-balance-values';
	import { formatPercent } from '$lib/utils';

	// Rows are pre-filtered to positive market values - a treemap can't size zero,
	// negative, or unknown values. `mode` picks the sizing dimension: market value,
	// or absolute gain/loss (direction is carried by the fill, so magnitude sizes
	// the rect and zero/unknown-gain positions drop out).
	let { rows, mode }: { rows: SecurityAggregate[]; mode: 'value' | 'gain' } = $props();

	const total = $derived(rows.reduce((sum, row) => sum + (row.value ?? 0), 0));

	const sizedRows = $derived(
		mode === 'value' ? rows : rows.filter((row) => row.gainLoss !== null && row.gainLoss !== 0)
	);
	// d3's hierarchy wants a single root; wrap the flat rows as its children.
	type TreemapDatum = SecurityAggregate | { children: SecurityAggregate[] };
	const root = $derived(
		hierarchy<TreemapDatum>({ children: sizedRows })
			.sum((datum) =>
				'id' in datum ? (mode === 'value' ? (datum.value ?? 0) : Math.abs(datum.gainLoss ?? 0)) : 0
			)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
	);

	function formatAllocation(value: number) {
		return `${((value / total) * 100).toLocaleString(getFormattingLocale(), {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		})}%`;
	}
</script>

<div class="h-[30vh] min-h-96 w-full">
	<Tooltip.Provider>
		<ChartCore>
			<Treemap hierarchy={root} paddingInner={2}>
				{#snippet children({ nodes })}
					{#each nodes as node ('id' in node.data ? node.data.id : 'root')}
						{#if 'id' in node.data}
							{@const row = node.data}
							{@const width = node.x1 - node.x0}
							{@const height = node.y1 - node.y0}
							{@const gainPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
							<!-- Fills always follow gain/loss sentiment; `mode` only swaps the headline
							     number. Unknown or flat positions read as "no signal" -->
							{@const fill =
								gainPercent === null || gainPercent === 0
									? 'var(--muted-foreground)'
									: gainPercent > 0
										? 'var(--cash)'
										: 'var(--debt)'}
							<Tooltip.Root delayDuration={50}>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<a
											{...props}
											href={resolve(`/securities/${row.id}`)}
											aria-label="{row.name}: {formatCurrency(row.value ?? 0, 2)}"
											class="focus-visible:ring-ring/70 absolute flex flex-col gap-0.5 overflow-hidden rounded-xs p-1.5 transition-[filter] hover:brightness-110 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none"
											style="left: {node.x0}px; top: {node.y0}px; width: {width}px; height: {height}px; background-color: {fill}"
										>
											<!-- Gate only on vertical fit per line; horizontal overflow ellipsizes -->
											{#if height >= 22}
												<span
													class="truncate text-sm leading-tight font-medium text-white uppercase"
												>
													{row.symbol ?? row.name}
												</span>
												{#if height >= 48}
													<span class="truncate font-mono text-white tabular-nums">
														{mode === 'value'
															? formatCurrency(row.value ?? 0, 2)
															: gainPercent === null
																? '~'
																: formatPercent(gainPercent)}
													</span>
												{/if}
											{/if}
										</a>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content class="grid min-w-[11rem] items-start gap-1.5">
									<p class="border-border -mx-2.5 border-b px-2.5 pb-1.5 text-sm font-medium">
										{row.name}
									</p>
									<div class="grid gap-1.5">
										<div class="flex items-center justify-between gap-4 text-base leading-none">
											<span class="text-muted-foreground text-sm">
												{m.securities_table_header_value()}
											</span>
											<Currency
												value={row.value ?? 0}
												decimalScale={2}
												isConverted={row.isConverted}
												isUnconverted={row.isUnconverted}
												showFxTooltip={false}
											/>
										</div>
										<div class="flex items-center justify-between gap-4 text-base leading-none">
											<span class="text-muted-foreground text-sm">
												{m.allocation_section_title()}
											</span>
											<NumberDisplay value={formatAllocation(row.value ?? 0)} />
										</div>
										<div class="flex items-center justify-between gap-4 text-base leading-none">
											<span class="text-muted-foreground text-sm">
												{m.securities_table_header_gain_loss()}
											</span>
											{#if row.gainLoss === null}
												<NumberDisplay value="~" sentiment="neutral" />
											{:else}
												<Currency
													value={row.gainLoss}
													decimalScale={2}
													sentiment={sentiment(row.gainLoss)}
													isConverted={row.isConverted}
													isUnconverted={row.isUnconverted}
													showFxTooltip={false}
												/>
											{/if}
										</div>
										<div class="flex items-center justify-between gap-4 text-base leading-none">
											<span class="text-muted-foreground text-sm">
												{m.securities_table_header_gain_loss_percent()}
											</span>
											{#if gainPercent === null}
												<NumberDisplay value="~" sentiment="neutral" />
											{:else}
												<NumberDisplay
													value={formatPercent(gainPercent)}
													sentiment={sentiment(gainPercent)}
												/>
											{/if}
										</div>
									</div>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
					{/each}
				{/snippet}
			</Treemap>
		</ChartCore>
	</Tooltip.Provider>
</div>
