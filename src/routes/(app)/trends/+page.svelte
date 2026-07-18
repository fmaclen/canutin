<script lang="ts">
	import type { RecordSubscription } from 'pocketbase';
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import { type TrendSecurityBalance } from '$lib/balance-series';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
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
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { projectSignedValue } from '$lib/sharing';
	import { toNumber } from '$lib/utils';

	import GroupChart from './group-chart.svelte';
	import ChartNetWorth from './growth.svelte';
	import Performance from './performance.svelte';
	import {
		buildPreparedMaps,
		computeBoundedHistoryStart,
		type PeriodKey,
		type TrendMemberSeries
	} from './trends';

	const pb = getPocketBaseContext();
	const accountsCtx = getAccountsContext();
	const assetsCtx = getAssetsContext();
	const securitiesCtx = getSecuritiesContext();

	let bootstrapped = $state(false);
	const isLoading = $derived(!bootstrapped);

	let period: PeriodKey = $state('1y');
	let memberSeries: TrendMemberSeries = $state({ members: [], rows: [] });
	let rawAccounts: AccountsResponse[] = $state([]);
	let rawAssets: AssetsResponse[] = $state([]);
	let rawAccountBalances: AccountBalancesResponse[] = $state([]);
	let rawSecurityBalances: TrendSecurityBalance[] = $state([]);
	let rawAssetBalances: AssetBalancesResponse[] = $state([]);
	let rawFullHistoryAccountBalances: AccountBalancesResponse[] = $state([]);
	let rawFullHistorySecurityBalances: TrendSecurityBalance[] = $state([]);
	let rawFullHistoryAssetBalances: AssetBalancesResponse[] = $state([]);
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
			securitiesCtx?.securities ?? [],
			rawAccountBalances,
			rawSecurityBalances,
			rawAssetBalances
		)
	);
	const fullHistoryPrepared = $derived.by(() =>
		buildPreparedMaps(
			rawAccounts,
			rawAssets,
			securitiesCtx?.securities ?? [],
			rawFullHistoryAccountBalances,
			rawFullHistorySecurityBalances,
			rawFullHistoryAssetBalances
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

	function historyFilter(idsFilter: string, start: Date) {
		if (!idsFilter) return '';
		return `(${idsFilter}) && asOf>='${start.toISOString()}'`;
	}

	type TrendBalanceRecord = { asOf: string; created: string; id: string };

	type BalanceRealtimeConfig<
		TRecord extends TrendBalanceRecord,
		TBalance extends TrendBalanceRecord
	> = {
		records: () => TBalance[];
		fullHistoryRecords: () => TBalance[];
		setRecords: (records: TBalance[]) => void;
		setFullHistoryRecords: (records: TBalance[]) => void;
		project: (record: TRecord) => TBalance | null;
		carryKey: (record: TBalance) => string;
		identityChanged: (existing: TBalance, balance: TBalance) => boolean;
	};

	function compareBalances<T extends { asOf: string; created: string; id: string }>(a: T, b: T) {
		if (a.asOf !== b.asOf) return a.asOf.localeCompare(b.asOf);
		if (a.created !== b.created) return a.created.localeCompare(b.created);
		return a.id.localeCompare(b.id);
	}

	function trimBalances<T extends TrendBalanceRecord>(
		records: T[],
		start: Date | null,
		carryKey: (record: T) => string
	) {
		if (!start) return records.toSorted(compareBalances);
		const previousByKey = new SvelteMap<string, T>();
		const inRange: T[] = [];
		for (const record of records) {
			if (new Date(record.asOf) >= start) {
				inRange.push(record);
				continue;
			}
			const key = carryKey(record);
			const previous = previousByKey.get(key);
			if (!previous || compareBalances(previous, record) < 0) previousByKey.set(key, record);
		}
		return [...previousByKey.values(), ...inRange].toSorted(compareBalances);
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

	async function listAccountBalances(filter: string) {
		if (!filter) return [];
		return pb.authedClient.collection('accountBalances').getFullList<AccountBalancesResponse>({
			sort: 'asOf,created,id',
			filter,
			fields: 'id,account,value,asOf,created',
			requestKey: null
		});
	}

	async function listSecurityBalances(filter: string) {
		if (!filter) return [];
		return pb.authedClient
			.collection('securityBalances')
			.getFullList<SecurityBalancesResponse<number, number, number, number>>({
				sort: 'asOf,created,id',
				filter,
				fields: 'id,account,security,value,quantity,asOf,created',
				requestKey: null
			});
	}

	async function listAssetBalances(filter: string) {
		if (!filter) return [];
		return pb.authedClient.collection('assetBalances').getFullList<AssetBalancesResponse>({
			sort: 'asOf,created,id',
			filter,
			fields: 'id,asset,marketValue,asOf,created',
			requestKey: null
		});
	}

	let refreshSequence = 0;

	async function doRefresh() {
		refreshInFlight = true;
		try {
			const sequence = ++refreshSequence;
			const start = computeBoundedHistoryStart('5y');
			if (!start) return;
			// Snapshot the signature this refresh reflects; the signature effect treats any later
			// divergence - including one committed while this refresh is in flight - as a change.
			lastIncludedSignature = includedSignature;
			const accountIds = Array.from(includedAccounts.keys());
			const assetIds = Array.from(includedAssets.keys());
			const accountFilter = filterByIds('account', accountIds);
			const assetFilter = filterByIds('asset', assetIds);
			const accountHistoryFilter = historyFilter(accountFilter, start);
			const assetHistoryFilter = historyFilter(assetFilter, start);
			try {
				const [
					accountBalancesRange,
					securityBalancesRangeRaw,
					assetBalancesRange,
					accountBalancesFullHistory,
					securityBalancesFullHistoryRaw,
					assetBalancesFullHistory
				] = await Promise.all([
					listAccountBalances(accountHistoryFilter),
					listSecurityBalances(accountHistoryFilter),
					listAssetBalances(assetHistoryFilter),
					listAccountBalances(accountFilter),
					listSecurityBalances(accountFilter),
					listAssetBalances(assetFilter)
				]);

				const securityBalancesRange = securityBalancesRangeRaw
					.map(projectSecurityBalance)
					.filter(isDefined);
				const securityBalancesFullHistory = securityBalancesFullHistoryRaw
					.map(projectSecurityBalance)
					.filter(isDefined);
				const [accountBalancesPrevious, securityBalancesPrevious, assetBalancesPrevious] =
					await Promise.all([
						Promise.all(
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
						),
						(async () => {
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
								const existing = latestByKey.get(key) ?? {
									balance,
									lastKnownValue: null,
									soldOut: false
								};
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
							return Array.from(latestByKey.values()).map(
								({ balance, lastKnownValue, soldOut }) => ({
									...balance,
									value: soldOut ? balance.value : lastKnownValue
								})
							);
						})(),
						Promise.all(
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
						)
					]);

				if (sequence !== refreshSequence) return;

				const accountBalances = trimBalances(
					[...accountBalancesPrevious, ...accountBalancesRange]
						.map((balance) => (balance ? projectAccountBalance(balance) : null))
						.filter(isDefined),
					start,
					(balance) => balance.account
				);
				const securityBalances = trimBalances(
					[
						...securityBalancesPrevious
							.map((balance) => (balance ? projectSecurityBalance(balance) : null))
							.filter(isDefined),
						...securityBalancesRange
					],
					start,
					(balance) => `${balance.account}:${balance.security}`
				);
				const assetBalances = trimBalances(
					[...assetBalancesPrevious, ...assetBalancesRange]
						.map((balance) => (balance ? projectAssetBalance(balance) : null))
						.filter(isDefined),
					start,
					(balance) => balance.asset
				);
				rawAccounts = Array.from(includedAccounts.values());
				rawAssets = Array.from(includedAssets.values());
				rawAccountBalances = accountBalances;
				rawSecurityBalances = securityBalances;
				rawAssetBalances = assetBalances;
				rawFullHistoryAccountBalances = trimBalances(
					accountBalancesFullHistory.map(projectAccountBalance).filter(isDefined),
					null,
					(balance) => balance.account
				);
				rawFullHistorySecurityBalances = trimBalances(
					securityBalancesFullHistory,
					null,
					(balance) => `${balance.account}:${balance.security}`
				);
				rawFullHistoryAssetBalances = trimBalances(
					assetBalancesFullHistory.map(projectAssetBalance).filter(isDefined),
					null,
					(balance) => balance.asset
				);
				historyStart = start;
			} catch (error) {
				pb.handleConnectionError(error, 'trends', 'refresh_balances');
			}
		} finally {
			refreshInFlight = false;
			if (pendingRefresh) {
				pendingRefresh = false;
				void doRefresh();
			}
		}
	}

	let refreshTimer: number | null = null;
	let refreshInFlight = false;
	let pendingRefresh = false;
	let lastIncludedSignature = '';

	function handleBalanceEvent<
		TRecord extends TrendBalanceRecord,
		TBalance extends TrendBalanceRecord
	>(event: RecordSubscription<TRecord>, config: BalanceRealtimeConfig<TRecord, TBalance>) {
		if (!event.action) return;
		if (!bootstrapped) {
			if (refreshInFlight) pendingRefresh = true;
			return;
		}
		const records = config.records();
		const fullHistoryRecords = config.fullHistoryRecords();
		const existing = records.find((balance) => balance.id === event.record.id);
		const fullHistoryExisting = fullHistoryRecords.find(
			(balance) => balance.id === event.record.id
		);
		if (event.action === 'delete') {
			if (existing) {
				config.setRecords(records.filter((balance) => balance.id !== event.record.id));
				if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			}
			if (fullHistoryExisting) {
				config.setFullHistoryRecords(
					fullHistoryRecords.filter((balance) => balance.id !== event.record.id)
				);
			}
			return;
		}
		const balance = config.project(event.record);
		if (!balance) {
			if (existing) {
				config.setRecords(records.filter((record) => record.id !== event.record.id));
				if (historyStart && new Date(existing.asOf) < historyStart) scheduleRefresh();
			}
			if (fullHistoryExisting) {
				config.setFullHistoryRecords(
					fullHistoryRecords.filter((record) => record.id !== event.record.id)
				);
			}
			return;
		}
		config.setFullHistoryRecords(
			trimBalances(
				[...fullHistoryRecords.filter((record) => record.id !== balance.id), balance],
				null,
				config.carryKey
			)
		);
		if (
			historyStart &&
			((existing && new Date(existing.asOf) < historyStart) ||
				new Date(balance.asOf) < historyStart)
		) {
			scheduleRefresh();
			return;
		}
		config.setRecords(
			trimBalances(
				[...records.filter((record) => record.id !== balance.id), balance],
				historyStart,
				config.carryKey
			)
		);
		if (existing && config.identityChanged(existing, balance)) scheduleRefresh();
	}

	function scheduleRefresh() {
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
				.subscribe<AccountBalancesResponse>('*', (event) =>
					handleBalanceEvent(event, {
						records: () => rawAccountBalances,
						fullHistoryRecords: () => rawFullHistoryAccountBalances,
						setRecords: (records) => (rawAccountBalances = records),
						setFullHistoryRecords: (records) => (rawFullHistoryAccountBalances = records),
						project: projectAccountBalance,
						carryKey: (balance) => balance.account,
						identityChanged: (existing, balance) => existing.account !== balance.account
					})
				)
		);
		addSubscription(
			pb.authedClient
				.collection('securityBalances')
				.subscribe<SecurityBalancesResponse<number, number, number, number>>('*', (event) =>
					handleBalanceEvent(event, {
						records: () => rawSecurityBalances,
						fullHistoryRecords: () => rawFullHistorySecurityBalances,
						setRecords: (records) => (rawSecurityBalances = records),
						setFullHistoryRecords: (records) => (rawFullHistorySecurityBalances = records),
						project: projectSecurityBalance,
						carryKey: (balance) => `${balance.account}:${balance.security}`,
						identityChanged: (existing, balance) =>
							existing.account !== balance.account || existing.security !== balance.security
					})
				)
		);
		addSubscription(
			pb.authedClient.collection('assetBalances').subscribe<AssetBalancesResponse>('*', (event) =>
				handleBalanceEvent(event, {
					records: () => rawAssetBalances,
					fullHistoryRecords: () => rawFullHistoryAssetBalances,
					setRecords: (records) => (rawAssetBalances = records),
					setFullHistoryRecords: (records) => (rawFullHistoryAssetBalances = records),
					project: projectAssetBalance,
					carryKey: (balance) => balance.asset,
					identityChanged: (existing, balance) => existing.asset !== balance.asset
				})
			)
		);

		return () => {
			disposed = true;
			if (refreshTimer) clearTimeout(refreshTimer);
			for (const unsubscribe of unsubscribes) unsubscribe();
		};
	});

	// Defer the bootstrap refresh until the accounts and assets contexts have finished their
	// initial load - refreshing earlier would query with empty inclusion maps and resolve to a
	// false empty state before the contexts ever land.
	$effect(() => {
		if (bootstrapped) return;
		if (accountsCtx?.isLoading || assetsCtx?.isLoading) return;
		untrack(() => {
			void doRefresh().then(() => {
				bootstrapped = true;
			});
		});
	});

	$effect(() => {
		const signature = includedSignature;
		if (signature === lastIncludedSignature) return;
		lastIncludedSignature = signature;
		if (refreshInFlight) {
			pendingRefresh = true;
			return;
		}
		if (!bootstrapped) return;
		scheduleRefresh();
	});

	const isEmpty = $derived(!rawAccounts.length && !rawAssets.length);
	// NOTE: reference the raw tokens (--cash, not --color-cash): ChartStyle re-emits each config
	// color as --color-<key> per chart, so var(--color-cash) would be a circular reference.
	const groupCharts = [
		{ key: 'cash', label: m.trends_series_cash_label(), color: 'var(--cash)' },
		{ key: 'debt', label: m.trends_series_debt_label(), color: 'var(--debt)' },
		{ key: 'investment', label: m.trends_series_investment_label(), color: 'var(--investment)' },
		{ key: 'other', label: m.trends_series_other_label(), color: 'var(--other-assets)' }
	] as const;
	const membersByGroup = $derived(
		Map.groupBy(
			memberSeries.members.toSorted((a, b) => a.label.localeCompare(b.label)),
			(member) => member.group
		)
	);
</script>

<Page pageTitle={m.trends_page_title()}>
	<Tabs.Root bind:value={period}>
		<Section>
			<SectionTitle title={m.trends_growth_section_title()}>
				<Tabs.List>
					<Tabs.Trigger value="3m">{m.period_3m_label()}</Tabs.Trigger>
					<Tabs.Trigger value="6m">{m.period_6m_label()}</Tabs.Trigger>
					<Tabs.Trigger value="ytd">{m.period_ytd_label()}</Tabs.Trigger>
					<Tabs.Trigger value="1y">{m.period_1y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="2y">{m.period_2y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="5y">{m.period_5y_label()}</Tabs.Trigger>
					<Tabs.Trigger value="max">{m.period_max_label()}</Tabs.Trigger>
				</Tabs.List>
			</SectionTitle>

			<ChartNetWorth
				bind:period
				bind:memberSeries
				{isLoading}
				prepared={period === 'max' ? fullHistoryPrepared : prepared}
				{rawAccounts}
				{rawAssets}
				rawAccountBalances={period === 'max' ? rawFullHistoryAccountBalances : rawAccountBalances}
				rawSecurityBalances={period === 'max'
					? rawFullHistorySecurityBalances
					: rawSecurityBalances}
				rawAssetBalances={period === 'max' ? rawFullHistoryAssetBalances : rawAssetBalances}
			/>
		</Section>
	</Tabs.Root>

	<Section>
		<SectionTitle title={m.trends_performance_section_title()} />
		<Performance
			{isLoading}
			{prepared}
			{fullHistoryPrepared}
			{rawAccounts}
			{rawAssets}
			{rawFullHistoryAccountBalances}
			{rawFullHistorySecurityBalances}
			{rawFullHistoryAssetBalances}
		/>
	</Section>

	{#if isLoading || !isEmpty}
		<div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
			{#each groupCharts as group (group.key)}
				{@const members = membersByGroup.get(group.key) ?? []}
				{#if isLoading || members.length}
					<Section>
						<SectionTitle title={group.label} />
						{#if isLoading}
							<Skeleton class="h-[30vh] min-h-96" showSpinner />
						{:else}
							<div class="bg-background overflow-visible rounded-sm shadow-md">
								<GroupChart {members} rows={memberSeries.rows} color={group.color} />
							</div>
						{/if}
					</Section>
				{/if}
			{/each}
		</div>
	{/if}
</Page>
