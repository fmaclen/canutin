<script lang="ts">
	import { page } from '$app/state';
	import { getAssetsContext } from '$lib/assets.svelte';
	import { formatNativeCurrency } from '$lib/components/currency';
	import KeyValue from '$lib/components/key-value.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import SharedRecordReadonlyBanner from '$lib/components/shared-record-readonly-banner.svelte';
	import TimeSeriesChart from '$lib/components/time-series-chart.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import type { AssetBalancesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { projectSignedValue } from '$lib/sharing';

	const assetsContext = getAssetsContext();
	const pb = getPocketBaseContext();

	const assetId = $derived(page.params.id);
	const asset = $derived(assetId ? assetsContext.getAsset(assetId) : null);
	const isLoading = $derived(assetsContext.isLoading);
	const loaded = $derived(!isLoading && !!asset);
	const canWrite = $derived(Boolean(asset?.canWrite));

	const showBanner = $derived(loaded && !canWrite);

	const balanceHistoryAssetId = $derived(asset?.id ?? '');
	const balanceHistoryPerspective = $derived(asset?.perspective);
	let balanceHistory = $state<{ date: Date; value: number }[]>([]);
	let balanceHistoryLoading = $state(true);

	$effect(() => {
		balanceHistory = [];
		balanceHistoryLoading = Boolean(balanceHistoryAssetId);
	});

	$effect(() => {
		const id = balanceHistoryAssetId;
		const perspective = balanceHistoryPerspective;
		const balanceEvent = assetsContext.lastBalanceEvent;
		let cancelled = false;
		if (!id || perspective === undefined || balanceEvent === 0) return;

		void pb.authedClient
			.collection('assetBalances')
			.getFullList<AssetBalancesResponse>({
				filter: `asset='${id}'`,
				sort: 'asOf,created,id',
				fields: 'id,marketValue,asOf',
				requestKey: null
			})
			.then((records) => {
				if (cancelled) return;
				balanceHistory = records.map((record) => ({
					date: new Date(record.asOf),
					value: projectSignedValue(record.marketValue ?? 0, perspective)
				}));
				balanceHistoryLoading = false;
			})
			.catch((error) => {
				if (cancelled) return;
				pb.handleConnectionError(error, 'assets', 'balance_history');
				balanceHistoryLoading = false;
			});

		return () => {
			cancelled = true;
		};
	});
</script>

{#if showBanner}
	<Section>
		<SharedRecordReadonlyBanner title={m.assets_readonly_title()} />
	</Section>
{/if}

<Section>
	<SectionTitle title={m.assets_overview_section_summary()} />
	{#if !loaded || !asset}
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			<Skeleton class="h-14" />
			<Skeleton class="h-14" />
		</div>
	{:else}
		<div
			role="region"
			aria-label={m.assets_overview_section_summary()}
			class="grid grid-cols-1 gap-2 sm:grid-cols-2"
		>
			<KeyValue
				title={m.assets_label_market_value()}
				value={asset.displayMarketValue}
				variant="outline"
				decimalScale={2}
				isUnconverted={asset.isUnconverted}
			/>
			<KeyValue
				title={m.assets_label_book_value()}
				value={asset.displayBookValue}
				variant="outline"
				decimalScale={2}
				isUnconverted={asset.isUnconverted}
			/>
		</div>
	{/if}
</Section>

<Section>
	<!-- The USD fallback is never hit: the chart only renders once the asset has loaded -->
	<TimeSeriesChart
		title={m.balance_history_section_title()}
		isLoading={!loaded || balanceHistoryLoading || !asset}
		rows={balanceHistory}
		period="max"
		series={[
			{
				key: 'value',
				label: m.balance_history_series_label(),
				color: 'var(--brand)',
				value: (point) => point.value
			}
		]}
		emptyMessage={m.balance_history_empty()}
		formatAxisValue={(value) =>
			formatNativeCurrency(Math.round(value), 0, asset?.currency ?? 'USD')}
		formatTooltipValue={(value) => formatNativeCurrency(value, 2, asset?.currency ?? 'USD')}
	/>
</Section>
