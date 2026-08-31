import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { setBalanceTypesContext } from './balance-types.svelte';
import { getExchangeRatesContext } from './exchange-rates.svelte';
import { logError } from './logger';
import {
	AssetSharesAccessRoleOptions,
	AssetSharesPerspectiveOptions,
	type AssetBalancesResponse,
	type AssetSharesResponse,
	type AssetsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { StaleSync } from './realtime-sync';
import { participantExcluded, projectAssetFinancials } from './sharing';
import { toPocketBaseDateString } from './utils';

type AssetBalanceData = {
	marketValue: number;
	bookValue: number;
	gain: number;
	gainPercent: number;
	balanceAsOf: string;
};

// NOTE: `bookValue`/`marketValue`/`gain` above stay the native, perspective-projected amounts;
// the `display*` counterparts are the same amounts converted to the display currency (mirrors
// transactions.svelte.ts's value/displayValue split). `gainPercent` is a ratio, so it's
// currency-invariant and has no display counterpart. All three conversions share the same
// asset currency + balance date, so a single isConverted/isUnconverted pair covers all of them.
type AssetDisplayBalanceData = AssetBalanceData & {
	displayBookValue: number;
	displayMarketValue: number;
	displayGain: number;
	isConverted: boolean;
	isUnconverted: boolean;
	missingCurrency: string | null;
};

// The sync-layer cache of each asset's latest balance. Unlike AssetBalanceData it carries no
// gain/gainPercent - those belong to the display projection (computeBalanceData), not the raw cache.
type LatestAssetBalance = {
	marketValue: number;
	bookValue: number;
	balanceAsOf: string;
};

const DEFAULT_BALANCE_DATA: LatestAssetBalance = {
	marketValue: 0,
	bookValue: 0,
	balanceAsOf: ''
};

export type AssetWithBalance = AssetsResponse &
	AssetDisplayBalanceData & {
		isOwner: boolean;
		canWrite: boolean;
		accessRole: 'OWNER' | AssetSharesAccessRoleOptions;
		perspective: AssetSharesPerspectiveOptions;
		participantExcluded: boolean;
		incomingShareId: string | null;
		isShared: boolean;
	};

class AssetsContext {
	assets: AssetWithBalance[] = $derived.by(() =>
		this.rawAssets.map((asset) =>
			this.toAssetWithBalance(
				asset,
				this.latestBalanceByAsset.get(asset.id) ?? DEFAULT_BALANCE_DATA
			)
		)
	);
	shares: AssetSharesResponse[] = $state([]);
	lastBalanceEvent = $state(0);
	isLoading = $state(true);

	private rawAssets: AssetsResponse[] = $state([]);
	private latestBalanceByAsset = new SvelteMap<string, LatestAssetBalance>();
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _fx: ReturnType<typeof getExchangeRatesContext>;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;
	private sync: StaleSync;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(
		pb: PocketBaseContext,
		balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
	) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this.sync = new StaleSync(pb, 'assets', 'refresh', (token) => this.refreshAll(token));
		this._pb.registerRealtimeSync(this.sync);
		this._fx = getExchangeRatesContext();
		this.balanceTypesContext = balanceTypesContext;
		this.init();
	}

	private get currentUserId() {
		return this._auth.currentUserId;
	}

	getTypeName(id: string) {
		return this.balanceTypesContext.getName(id);
	}

	getAsset(id: string) {
		return this.assets.find((a) => a.id === id);
	}

	getIncomingShare(assetId: string) {
		return this.shares.find(
			(share) => share.asset === assetId && share.recipient === this.currentUserId
		);
	}

	getGrantedShares(assetId: string) {
		return this.shares
			.filter((share) => share.asset === assetId && share.grantedBy === this.currentUserId)
			.sort((a, b) => a.recipientEmail.localeCompare(b.recipientEmail));
	}

	async deleteAsset(id: string) {
		await this._pb.authedClient.collection('assets').delete(id);
	}

	async createShare(
		assetId: string,
		recipientEmail: string,
		perspective: AssetSharesPerspectiveOptions
	) {
		await this._pb.postJson('/api/shares/assets', {
			assetId,
			recipientEmail,
			perspective
		});
		await this.sync.refreshNow();
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		await this._pb.authedClient.collection('assetShares').update(shareId, { includeInNetWorth });
		await this.sync.refreshNow();
	}

	async revokeShare(shareId: string) {
		await this._pb.authedClient.collection('assetShares').delete(shareId);
		await this.sync.refreshNow();
	}

	private init() {
		$effect(() => {
			const userId = this.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.sync.cancel();
			this._activeUserId = userId;
			if (!userId) {
				this.rawAssets = [];
				this.latestBalanceByAsset.clear();
				this.shares = [];
				this.lastBalanceEvent = 0;
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.lastBalanceEvent = 0;
			this.realtimeSubscribe(userId);
			void this.sync.refreshNow();
		});
	}

	// Realtime events and reconnects are pure invalidation signals: they never patch a payload into
	// state, they only mark the store stale and schedule a full refetch. Deletes, share membership
	// changes, and cross-asset balance reassignments all resolve for free because the fresh snapshot
	// reflects the database as-is.
	private async refreshAll(token: number) {
		const userId = this.currentUserId;
		try {
			const [shares, assets, balances] = await Promise.all([
				this._pb.authedClient.collection('assetShares').getFullList<AssetSharesResponse>({
					filter: `grantedBy='${userId}' || recipient='${userId}'`,
					sort: 'recipientEmail',
					requestKey: null
				}),
				this._pb.authedClient.collection('assets').getFullList<AssetsResponse>({
					filter: `owner='${userId}' || assetShares_via_asset.recipient ?= '${userId}'`,
					requestKey: null
				}),
				// One query for every asset's latest balance instead of N point-queries: the
				// 'asset,-asOf,-created,-id' sort groups by asset and orders each group newest-first,
				// so the first row seen per asset wins - the same tiebreakers getList(1,1) used.
				this._pb.authedClient.collection('assetBalances').getFullList<AssetBalancesResponse>({
					sort: 'asset,-asOf,-created,-id',
					fields: 'asset,bookValue,marketValue,asOf',
					requestKey: null
				})
			]);
			if (userId !== this.currentUserId || !this.sync.isCurrent(token)) return;
			for (const asset of assets) {
				await this.balanceTypesContext.ensureLoaded(asset.balanceType);
			}
			if (userId !== this.currentUserId || !this.sync.isCurrent(token)) return;

			this.shares = shares.toSorted((a, b) => a.recipientEmail.localeCompare(b.recipientEmail));
			this.latestBalanceByAsset.clear();
			for (const balance of balances) {
				if (this.latestBalanceByAsset.has(balance.asset)) continue;
				this.latestBalanceByAsset.set(balance.asset, {
					marketValue: balance.marketValue ?? 0,
					bookValue: balance.bookValue ?? 0,
					balanceAsOf: balance.asOf
				});
			}
			this.rawAssets = assets;
			this.lastBalanceEvent = Date.now();
		} finally {
			if (userId === this.currentUserId && this.sync.isCurrent(token)) this.isLoading = false;
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('assets')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'assets', 'subscribe_assets');
				} else {
					logError('assetsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('assetBalances')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'assets', 'subscribe_balances');
				} else {
					logError('assetsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('assetShares')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'assets', 'subscribe_shares');
				} else {
					logError('assetsStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private onRealtimeEvent(userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		this.sync.invalidate();
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('assets').unsubscribe('*');
		this._pb.authedClient.collection('assetBalances').unsubscribe('*');
		this._pb.authedClient.collection('assetShares').unsubscribe('*');
	}

	private computeBalanceData(
		balance: Pick<AssetBalancesResponse, 'asOf' | 'bookValue' | 'marketValue'>,
		perspective: AssetSharesPerspectiveOptions,
		currency: string
	) {
		const projected = projectAssetFinancials(balance.bookValue, balance.marketValue, perspective);
		// NOTE: falls back to now when there's no balance yet (a fresh asset with no snapshot),
		// so the row still converts at a sensible rate.
		const date = balance.asOf || toPocketBaseDateString(new Date());
		const bookValueConversion = this._fx.convert(projected.bookValue, currency, date);
		const marketValueConversion = this._fx.convert(projected.marketValue, currency, date);
		const gainConversion = this._fx.convert(projected.gain, currency, date);
		return {
			...projected,
			balanceAsOf: balance.asOf,
			displayBookValue: bookValueConversion.isUnconverted ? 0 : bookValueConversion.value,
			displayMarketValue: marketValueConversion.isUnconverted ? 0 : marketValueConversion.value,
			displayGain: gainConversion.isUnconverted ? 0 : gainConversion.value,
			isConverted:
				bookValueConversion.isConverted ||
				marketValueConversion.isConverted ||
				gainConversion.isConverted,
			isUnconverted:
				bookValueConversion.isUnconverted ||
				marketValueConversion.isUnconverted ||
				gainConversion.isUnconverted,
			missingCurrency:
				bookValueConversion.missingCurrency ??
				marketValueConversion.missingCurrency ??
				gainConversion.missingCurrency
		};
	}

	private toAssetWithBalance(asset: AssetsResponse, rawBalanceData: LatestAssetBalance) {
		const incomingShare = this.getIncomingShare(asset.id);
		const isOwner = asset.owner === this.currentUserId;
		const perspective = isOwner
			? AssetSharesPerspectiveOptions.NORMAL
			: (incomingShare?.perspective ?? AssetSharesPerspectiveOptions.NORMAL);
		const accessRole: AssetWithBalance['accessRole'] = isOwner
			? 'OWNER'
			: (incomingShare?.accessRole ?? AssetSharesAccessRoleOptions.VIEWER);
		const grantedShares = this.getGrantedShares(asset.id);
		const isShared = !isOwner || grantedShares.length > 0;

		return {
			...asset,
			...this.computeBalanceData(
				{
					asOf: rawBalanceData.balanceAsOf,
					bookValue: rawBalanceData.bookValue,
					marketValue: rawBalanceData.marketValue
				},
				perspective,
				asset.currency
			),
			isOwner,
			canWrite: isOwner,
			accessRole,
			perspective,
			participantExcluded: participantExcluded(
				isOwner,
				Boolean(asset.excluded),
				incomingShare?.includeInNetWorth
			),
			incomingShareId: incomingShare?.id ?? null,
			isShared
		};
	}

	dispose() {
		this.sync.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeSync(this.sync);
		this.unsubscribeRealtime();
	}
}

export function setAssetsContext(
	pb: PocketBaseContext,
	balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
) {
	return setContext('assets', new AssetsContext(pb, balanceTypesContext));
}

export function getAssetsContext() {
	return getContext<ReturnType<typeof setAssetsContext>>('assets');
}
