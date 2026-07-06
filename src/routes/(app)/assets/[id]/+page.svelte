<script lang="ts">
	import { page } from '$app/state';
	import { getAssetsContext, type AssetWithBalance } from '$lib/assets.svelte';
	import { createBalanceHistoryLoader } from '$lib/balance-history.svelte';
	import BalanceHistoryChart from '$lib/components/balance-history-chart.svelte';
	import Empty from '$lib/components/empty.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import SharedRecordReadonlyBanner from '$lib/components/shared-record-readonly-banner.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import type { AssetBalancesResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const assetsContext = getAssetsContext();
	const pb = getPocketBaseContext();

	const assetId = $derived(page.params.id);
	const asset = $derived(assetId ? assetsContext.getAsset(assetId) : null);
	const isLoading = $derived(assetsContext.isLoading);
	const loaded = $derived(!isLoading && !!asset);
	const canWrite = $derived(Boolean(asset?.canWrite));

	const showBanner = $derived(loaded && !canWrite);

	const balanceHistoryLoader = createBalanceHistoryLoader<AssetWithBalance, AssetBalancesResponse>(
		pb,
		'assets',
		() => asset,
		(current) =>
			pb.authedClient.collection('assetBalances').getFullList<AssetBalancesResponse>({
				filter: `asset='${current.id}'`,
				sort: 'asOf,created,id',
				fields: 'id,marketValue,asOf',
				requestKey: null
			}),
		(record) => record.marketValue ?? 0
	);
	const balanceHistory = $derived(balanceHistoryLoader.history);
	const balanceHistoryLoading = $derived(balanceHistoryLoader.isLoading);

	const showBalanceHistory = $derived(
		loaded && (balanceHistoryLoading || balanceHistory.length >= 2)
	);
	const showEmpty = $derived(loaded && !showBanner && !showBalanceHistory);
</script>

{#if showBanner}
	<Section>
		<SharedRecordReadonlyBanner title={m.assets_readonly_title()} />
	</Section>
{/if}

{#if showBalanceHistory && asset}
	<Section>
		<SectionTitle title={m.balance_history_section_title()} />
		{#if balanceHistoryLoading}
			<Skeleton class="h-64" showSpinner />
		{:else}
			<div class="bg-background overflow-visible rounded-sm shadow-md">
				<BalanceHistoryChart points={balanceHistory} currency={asset.currency} />
			</div>
		{/if}
	</Section>
{/if}

{#if showEmpty}
	<Section>
		<Empty>{m.assets_overview_empty()}</Empty>
	</Section>
{/if}
