<script lang="ts">
	import type { RecordSubscription } from 'pocketbase';
	import { SvelteMap } from 'svelte/reactivity';

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
		AssetsResponse,
		SecurityBalancesResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { projectSignedValue } from '$lib/sharing';
	import { toNumber } from '$lib/utils';

	import ChartNetWorth from './growth.svelte';
	import Performance from './performance.svelte';
	import {
		buildPreparedMaps,
		computeBoundedHistoryStart,
		type PeriodKey,
		type TrendSecurityBalance
	} from './trends';

	const pb = getPocketBaseContext();
	const accountsCtx = getAccountsContext();
	const assetsCtx = getAssetsContext();

	let period: PeriodKey = $state('1y');
	let rawAccounts: AccountsResponse[] = $state([]);
	let rawAssets: AssetsResponse[] = $state([]);
	let rawAccountBalances: AccountBalancesResponse[] = $state([]);
	let rawSecurityBalances: TrendSecurityBalance[] = $state([]);
	let rawAssetBalances: AssetBalancesResponse[] = $state([]);
	let historyStart: Date | null = $state(null);

	const includedAccounts = $derived.by(
		() =>
			new Map(
				(accountsCtx?.accounts ?? [])
					.filter((account) => !account.participantExcluded)
					.map((account) => [account.id, account] as const)
			)
	);
	const includedAssets = $derived.by(
		() =>
			new Map(
				(assetsCtx?.assets ?? [])
					.filter((asset) => !asset.participantExcluded)
					.map((asset) => [asset.id, asset] as const)
			)
	);
	const includedSignature = $derived.by(() =>
		JSON.stringify({
			accounts: (accountsCtx?.accounts ?? []).map((account) => [
				account.id,
				account.participantExcluded,
				account.perspective,
				account.closed,
				account.balanceGroup
			]),
			assets: (assetsCtx?.assets ?? []).map((asset) => [
				asset.id,
				asset.participantExcluded,
				asset.perspective,
				asset.sold,
				asset.balanceGroup
			])
		})
	);
	const prepared = $derived.by(() =>
		buildPreparedMaps(
			rawAccounts,
			rawAssets,
			rawAccountBalances,
			rawSecurityBalances,
			rawAssetBalances
		)
	);

	function isDefined<T>(value: T | null | undefined): value is T {
		return value !== null && value !== undefined;
	}

	function quoteFilterValue(value: string) {
		return value.replaceAll("'", "\\'");
	}

	function filterByIds(field: string, ids: string[]) {
		return ids.map((id) => `${field}='${quoteFilterValue(id)}'`).join(' || ');
	}

	function historyFilter(field: string, ids: string[], start: Date | null) {
		const idsFilter = filterByIds(field, ids);
		if (!idsFilter) return '';
		return start ? `(${idsFilter}) && asOf>='${start.toISOString()}'` : idsFilter;
	}

	function compareBalances<T extends { asOf: string; created: string; id: string }>(a: T, b: T) {
		if (a.asOf !== b.asOf) return a.asOf.localeCompare(b.asOf);
		if (a.created !== b.created) return a.created.localeCompare(b.created);
		return a.id.localeCompare(b.id);
	}

	function computeHistoryStart() {
		if (period === 'max') return null;
		const periodStart = computeBoundedHistoryStart(period);
		const performanceStart = computeBoundedHistoryStart('5y');
		if (!periodStart) return performanceStart;
		if (!performanceStart) return periodStart;
		return periodStart < performanceStart ? periodStart : performanceStart;
	}

	function trimAccountBalances(records: AccountBalancesResponse[], start: Date | null) {
		if (!start) return records.toSorted(compareBalances);
		const previousByAccount = new SvelteMap<string, AccountBalancesResponse>();
		const inRange: AccountBalancesResponse[] = [];
		for (const record of records) {
			if (new Date(record.asOf) >= start) {
				inRange.push(record);
				continue;
			}
			const previous = previousByAccount.get(record.account);
			if (!previous || compareBalances(previous, record) < 0)
				previousByAccount.set(record.account, record);
		}
		return [...previousByAccount.values(), ...inRange].toSorted(compareBalances);
	}

	function trimSecurityBalances(records: TrendSecurityBalance[], start: Date | null) {
		if (!start) return records.toSorted(compareBalances);
		const previousByAccountSecurity = new SvelteMap<string, TrendSecurityBalance>();
		const inRange: TrendSecurityBalance[] = [];
		for (const record of records) {
			if (new Date(record.asOf) >= start) {
				inRange.push(record);
				continue;
			}
			const key = `${record.account}:${record.security}`;
			const previous = previousByAccountSecurity.get(key);
			if (!previous || compareBalances(previous, record) < 0) {
				previousByAccountSecurity.set(key, record);
			}
		}
		return [...previousByAccountSecurity.values(), ...inRange].toSorted(compareBalances);
	}

	function trimAssetBalances(records: AssetBalancesResponse[], start: Date | null) {
		if (!start) return records.toSorted(compareBalances);
		const previousByAsset = new SvelteMap<string, AssetBalancesResponse>();
		const inRange: AssetBalancesResponse[] = [];
		for (const record of records) {
			if (new Date(record.asOf) >= start) {
				inRange.push(record);
				continue;
			}
			const previous = previousByAsset.get(record.asset);
			if (!previous || compareBalances(previous, record) < 0)
				previousByAsset.set(record.asset, record);
		}
		return [...previousByAsset.values(), ...inRange].toSorted(compareBalances);
	}

	function projectAccountBalance(balance: AccountBalancesResponse) {
		const account = includedAccounts.get(balance.account);
		if (!account) return null;
		return {
			...balance,
			value:
				account.closed && new Date(balance.asOf) >= new Date(account.closed)
					? 0
					: projectSignedValue(balance.value, account.perspective)
		};
	}

	function projectSecurityBalance(
		balance: SecurityBalancesResponse<number, number, number, number>
	) {
		const account = includedAccounts.get(balance.account);
		if (!account) return null;
		const value = toNumber(balance.value);
		return {
			id: balance.id,
			account: balance.account,
			security: balance.security,
			created: balance.created,
			asOf: balance.asOf,
			value:
				account.closed && new Date(balance.asOf) >= new Date(account.closed)
					? 0
					: value === null
						? null
						: projectSignedValue(value, account.perspective),
			quantity:
				account.closed && new Date(balance.asOf) >= new Date(account.closed) ? 0 : balance.quantity
		};
	}

	function projectAssetBalance(balance: AssetBalancesResponse) {
		const asset = includedAssets.get(balance.asset);
		if (!asset) return null;
		return {
			...balance,
			marketValue:
				asset.sold && new Date(balance.asOf) >= new Date(asset.sold)
					? 0
					: projectSignedValue(balance.marketValue, asset.perspective)
		};
	}

	async function previousAccountBalances(accountIds: string[], start: Date) {
		return Promise.all(
			accountIds.map(async (accountId) => {
				const result = await pb.authedClient
					.collection('accountBalances')
					.getList<AccountBalancesResponse>(1, 1, {
						filter: `account='${quoteFilterValue(accountId)}' && asOf<'${start.toISOString()}'`,
						sort: '-asOf,-created,-id',
						fields: 'id,account,value,asOf,created',
						requestKey: null
					});
				return result.items[0] ?? null;
			})
		);
	}

	async function previousSecurityBalances(accountIds: string[], start: Date) {
		const accountFilter = filterByIds('account', accountIds);
		if (!accountFilter) return [];
		const balances = await pb.authedClient
			.collection('securityBalances')
			.getFullList<SecurityBalancesResponse<number, number, number, number>>({
				filter: `(${accountFilter}) && asOf<'${start.toISOString()}'`,
				sort: 'account,security,asOf,created,id',
				fields: 'id,account,security,value,quantity,asOf,created',
				requestKey: null
			});

		const latestByKey = new SvelteMap<
			string,
			{
				balance: SecurityBalancesResponse<number, number, number, number>;
				lastKnownValue: number | null;
				soldOut: boolean;
			}
		>();
		for (const balance of balances) {
			const key = `${balance.account}:${balance.security}`;
			const existing = latestByKey.get(key) ?? { balance, lastKnownValue: null, soldOut: false };
			if (toNumber(balance.quantity) === 0) {
				existing.lastKnownValue = 0;
				existing.soldOut = true;
			} else {
				const value = toNumber(balance.value);
				if (value !== null) {
					existing.lastKnownValue = value;
					existing.soldOut = false;
				}
			}
			existing.balance = balance;
			latestByKey.set(key, existing);
		}
		return Array.from(latestByKey.values()).map(({ balance, lastKnownValue, soldOut }) => ({
			...balance,
			value: soldOut ? balance.value : lastKnownValue
		}));
	}

	async function previousAssetBalances(assetIds: string[], start: Date) {
		return Promise.all(
			assetIds.map(async (assetId) => {
				const result = await pb.authedClient
					.collection('assetBalances')
					.getList<AssetBalancesResponse>(1, 1, {
						filter: `asset='${quoteFilterValue(assetId)}' && asOf<'${start.toISOString()}'`,
						sort: '-asOf,-created,-id',
						fields: 'id,asset,marketValue,asOf,created',
						requestKey: null
					});
				return result.items[0] ?? null;
			})
		);
	}

	let refreshSequence = 0;

	async function refreshBalances() {
		const sequence = ++refreshSequence;
		const start = computeHistoryStart();
		const accountIds = Array.from(includedAccounts.keys());
		const assetIds = Array.from(includedAssets.keys());
		const accountFilter = historyFilter('account', accountIds, start);
		const securityFilter = historyFilter('account', accountIds, start);
		const assetFilter = historyFilter('asset', assetIds, start);
		try {
			const [accountBalancesRange, securityBalancesRangeRaw, assetBalancesRange] =
				await Promise.all([
					accountFilter
						? pb.authedClient.collection('accountBalances').getFullList<AccountBalancesResponse>({
								sort: 'asOf,created,id',
								filter: accountFilter,
								fields: 'id,account,value,asOf,created',
								requestKey: null
							})
						: [],
					securityFilter
						? pb.authedClient
								.collection('securityBalances')
								.getFullList<SecurityBalancesResponse<number, number, number, number>>({
									sort: 'asOf,created,id',
									filter: securityFilter,
									fields: 'id,account,security,value,quantity,asOf,created',
									requestKey: null
								})
						: [],
					assetFilter
						? pb.authedClient.collection('assetBalances').getFullList<AssetBalancesResponse>({
								sort: 'asOf,created,id',
								filter: assetFilter,
								fields: 'id,asset,marketValue,asOf,created',
								requestKey: null
							})
						: []
				]);

			const securityBalancesRange = securityBalancesRangeRaw
				.map(projectSecurityBalance)
				.filter(isDefined);
			const [accountBalancesPrevious, securityBalancesPrevious, assetBalancesPrevious] = start
				? await Promise.all([
						previousAccountBalances(accountIds, start),
						previousSecurityBalances(accountIds, start),
						previousAssetBalances(assetIds, start)
					])
				: [[], [], []];

			if (sequence !== refreshSequence) return;

			const accountBalances = trimAccountBalances(
				[...accountBalancesPrevious, ...accountBalancesRange]
					.map((balance) => (balance ? projectAccountBalance(balance) : null))
					.filter(isDefined),
				start
			);
			const securityBalances = trimSecurityBalances(
				[
					...securityBalancesPrevious
						.map((balance) => (balance ? projectSecurityBalance(balance) : null))
						.filter(isDefined),
					...securityBalancesRange
				],
				start
			);
			const assetBalances = trimAssetBalances(
				[...assetBalancesPrevious, ...assetBalancesRange]
					.map((balance) => (balance ? projectAssetBalance(balance) : null))
					.filter(isDefined),
				start
			);

			rawAccounts = Array.from(includedAccounts.values());
			rawAssets = Array.from(includedAssets.values());
			rawAccountBalances = accountBalances;
			rawSecurityBalances = securityBalances;
			rawAssetBalances = assetBalances;
			historyStart = start;
		} catch (error) {
			pb.handleConnectionError(error, 'trends', 'refresh_balances');
		}
	}

	let refreshTimer: number | null = null;
	let refreshInFlight = false;
	let pendingRefresh = false;
	let bootstrapped = false;
	let lastIncludedSignature = '';

	function removeAccountBalance(id: string) {
		rawAccountBalances = rawAccountBalances.filter((balance) => balance.id !== id);
	}

	function removeSecurityBalance(id: string) {
		rawSecurityBalances = rawSecurityBalances.filter((balance) => balance.id !== id);
	}

	function removeAssetBalance(id: string) {
		rawAssetBalances = rawAssetBalances.filter((balance) => balance.id !== id);
	}

	function handleAccountBalanceEvent(event: RecordSubscription<AccountBalancesResponse>) {
		if (!event.action) return;
		if (!bootstrapped) {
			pendingRefresh = true;
			return;
		}
		const existing = rawAccountBalances.find((balance) => balance.id === event.record.id);
		if (event.action === 'delete') {
			if (!existing) return;
			removeAccountBalance(event.record.id);
			if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			return;
		}
		const balance = projectAccountBalance(event.record);
		if (!balance) {
			if (existing) {
				removeAccountBalance(event.record.id);
				if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			}
			return;
		}
		if (
			historyStart &&
			((existing && new Date(existing.asOf) < historyStart) ||
				new Date(balance.asOf) < historyStart)
		) {
			scheduleRefresh();
			return;
		}
		rawAccountBalances = trimAccountBalances(
			[...rawAccountBalances.filter((record) => record.id !== balance.id), balance],
			historyStart
		);
		if (existing && existing.account !== balance.account) scheduleRefresh();
	}

	function handleSecurityBalanceEvent(
		event: RecordSubscription<SecurityBalancesResponse<number, number, number, number>>
	) {
		if (!event.action) return;
		if (!bootstrapped) {
			pendingRefresh = true;
			return;
		}
		const existing = rawSecurityBalances.find((balance) => balance.id === event.record.id);
		if (event.action === 'delete') {
			if (!existing) return;
			removeSecurityBalance(event.record.id);
			if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			return;
		}
		const balance = projectSecurityBalance(event.record);
		if (!balance) {
			if (existing) {
				removeSecurityBalance(event.record.id);
				if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			}
			return;
		}
		if (
			historyStart &&
			((existing && new Date(existing.asOf) < historyStart) ||
				new Date(balance.asOf) < historyStart)
		) {
			scheduleRefresh();
			return;
		}
		rawSecurityBalances = trimSecurityBalances(
			[...rawSecurityBalances.filter((record) => record.id !== balance.id), balance],
			historyStart
		);
		if (
			existing &&
			(existing.account !== balance.account || existing.security !== balance.security)
		) {
			scheduleRefresh();
		}
	}

	function handleAssetBalanceEvent(event: RecordSubscription<AssetBalancesResponse>) {
		if (!event.action) return;
		if (!bootstrapped) {
			pendingRefresh = true;
			return;
		}
		const existing = rawAssetBalances.find((balance) => balance.id === event.record.id);
		if (event.action === 'delete') {
			if (!existing) return;
			removeAssetBalance(event.record.id);
			if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			return;
		}
		const balance = projectAssetBalance(event.record);
		if (!balance) {
			if (existing) {
				removeAssetBalance(event.record.id);
				if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			}
			return;
		}
		if (
			historyStart &&
			((existing && new Date(existing.asOf) < historyStart) ||
				new Date(balance.asOf) < historyStart)
		) {
			scheduleRefresh();
			return;
		}
		rawAssetBalances = trimAssetBalances(
			[...rawAssetBalances.filter((record) => record.id !== balance.id), balance],
			historyStart
		);
		if (existing && existing.asset !== balance.asset) scheduleRefresh();
	}

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
		let disposed = false;
		const unsubscribes: Array<() => void> = [];
		function addSubscription(subscription: Promise<() => void>) {
			subscription
				.then((unsubscribe) => {
					if (disposed) {
						unsubscribe();
						return;
					}
					unsubscribes.push(unsubscribe);
				})
				.catch((error) => pb.handleSubscriptionError(error, 'trends', 'subscribe_balances'));
		}

		addSubscription(
			pb.authedClient
				.collection('accountBalances')
				.subscribe<AccountBalancesResponse>('*', handleAccountBalanceEvent)
		);
		addSubscription(
			pb.authedClient
				.collection('securityBalances')
				.subscribe<
					SecurityBalancesResponse<number, number, number, number>
				>('*', handleSecurityBalanceEvent)
		);
		addSubscription(
			pb.authedClient
				.collection('assetBalances')
				.subscribe<AssetBalancesResponse>('*', handleAssetBalanceEvent)
		);

		return () => {
			disposed = true;
			if (refreshTimer) clearTimeout(refreshTimer);
			for (const unsubscribe of unsubscribes) unsubscribe();
		};
	});

	$effect(() => {
		void doRefresh().then(() => {
			bootstrapped = true;
		});
	});

	$effect(() => {
		const signature = includedSignature;
		if (!bootstrapped) {
			lastIncludedSignature = signature;
			return;
		}
		if (signature === lastIncludedSignature) return;
		lastIncludedSignature = signature;
		scheduleRefresh();
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
					<Tabs.Trigger value="2y">{m.period_2y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="5y">{m.period_5y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="max">{m.period_max_label()}</Tabs.Trigger>
				</Tabs.List>
			</nav>

			<ChartNetWorth
				bind:period
				{prepared}
				{rawAccounts}
				{rawAssets}
				{rawAccountBalances}
				{rawSecurityBalances}
				{rawAssetBalances}
			/>
		</Section>
	</Tabs.Root>

	<Section>
		<SectionTitle title={m.trends_performance_section_title()} />
		<Performance
			{prepared}
			{historyStart}
			{rawAccounts}
			{rawAssets}
			{rawAccountBalances}
			{rawSecurityBalances}
			{rawAssetBalances}
		/>
	</Section>
</Page>
