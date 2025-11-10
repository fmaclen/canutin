<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index';
	import { m } from '$lib/paraglide/messages';
	import type {
		AccountBalancesResponse,
		AccountsResponse,
		AssetBalancesResponse,
		AssetsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import ChartNetWorth from './growth.svelte';
	import Performance from './performance.svelte';

	const pb = getPocketBaseContext();
	const accountsCtx = getAccountsContext();
	const assetsCtx = getAssetsContext();

	let period: '3m' | '6m' | 'ytd' | '1y' | '5y' | 'max' = $state('1y');
	let rawAccounts: AccountsResponse[] = $state([]);
	let rawAssets: AssetsResponse[] = $state([]);
	let rawAccountBalances: AccountBalancesResponse[] = $state([]);
	let rawAssetBalances: AssetBalancesResponse[] = $state([]);

	async function refreshBalances() {
		try {
			const [accountBalancesAll, assetBalancesAll] = await Promise.all([
				pb.authedClient.collection('accountBalances').getFullList<AccountBalancesResponse>({
					sort: 'asOf,created,id',
					fields: 'id,account,value,asOf',
					requestKey: 'trends:accountBalances'
				}),
				pb.authedClient.collection('assetBalances').getFullList<AssetBalancesResponse>({
					sort: 'asOf,created,id',
					fields: 'id,asset,marketValue,asOf',
					requestKey: 'trends:assetBalances'
				})
			]);

			const activeAccounts = new Map(
				(accountsCtx?.accounts ?? [])
					.filter((a) => !a.excluded && !a.closed)
					.map((a) => [a.id, a] as const)
			);
			const activeAssets = new Map(
				(assetsCtx?.assets ?? [])
					.filter((a) => !a.excluded && !a.sold)
					.map((a) => [a.id, a] as const)
			);

			const accountBalances = accountBalancesAll.filter((b) => activeAccounts.has(b.account));
			const assetBalances = assetBalancesAll.filter((b) => activeAssets.has(b.asset));

			rawAccounts = Array.from(activeAccounts.values());
			rawAssets = Array.from(activeAssets.values());
			rawAccountBalances = accountBalances;
			rawAssetBalances = assetBalances;
		} catch (error) {
			pb.handleConnectionError(error, 'trends', 'refresh_balances');
		}
	}

	let refreshTimer: number | null = null;
	let refreshInFlight = false;
	let pendingRefresh = false;
	let bootstrapped = false;

	async function doRefresh() {
		refreshInFlight = true;
		await refreshBalances();
		refreshInFlight = false;
		if (pendingRefresh) {
			pendingRefresh = false;
			void doRefresh();
		}
	}

	function scheduleRefresh() {
		if (!bootstrapped) return;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			if (refreshInFlight) {
				pendingRefresh = true;
				return;
			}
			void doRefresh();
		}, 180);
	}

	$effect(() => {
		void refreshBalances().then(() => {
			bootstrapped = true;
		});
	});

	$effect(() => {
		if (accountsCtx?.lastBalanceEvent) scheduleRefresh();
	});

	$effect(() => {
		if (assetsCtx?.lastBalanceEvent) scheduleRefresh();
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_trends()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.trends_page_title()}>
	<Tabs.Root bind:value={period}>
		<Section>
			<nav class="flex items-center justify-between space-x-2">
				<SectionTitle title={m.trends_growth_section_title()} />
				<Tabs.List>
					<Tabs.Trigger value="3m">{m.period_3m_label()}</Tabs.Trigger>
					<Tabs.Trigger value="6m">{m.period_6m_label()}</Tabs.Trigger>
					<Tabs.Trigger value="ytd">{m.period_ytd_label()}</Tabs.Trigger>
					<Tabs.Trigger value="1y">{m.period_1y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="5y">{m.period_5y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="max">{m.period_max_label()}</Tabs.Trigger>
				</Tabs.List>
			</nav>

			<ChartNetWorth
				bind:period
				{rawAccounts}
				{rawAssets}
				{rawAccountBalances}
				{rawAssetBalances}
			/>
		</Section>
	</Tabs.Root>

	<Section>
		<SectionTitle title={m.trends_performance_section_title()} />
		<Performance {rawAccounts} {rawAssets} {rawAccountBalances} {rawAssetBalances} />
	</Section>
</Page>
