import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { setBalanceTypesContext } from './balance-types.svelte';
import { logError } from './logger';
import {
	AssetSharesAccessRoleOptions,
	AssetSharesPerspectiveOptions,
	type AssetBalancesResponse,
	type AssetSharesResponse,
	type AssetsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { participantExcluded, projectAssetFinancials } from './sharing';
import { isUnavailableRecordError, removeById, upsertById } from './utils';

type AssetBalanceData = {
	marketValue: number;
	bookValue: number;
	gain: number;
	gainPercent: number;
	balanceAsOf: string;
};

type LatestAssetBalance = AssetBalanceData & {
	id: string;
	created: string;
};

const DEFAULT_BALANCE_DATA: AssetBalanceData = {
	marketValue: 0,
	bookValue: 0,
	gain: 0,
	gainPercent: 0,
	balanceAsOf: ''
};

export type AssetWithBalance = AssetsResponse &
	AssetBalanceData & {
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
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private rawAssets: AssetsResponse[] = $state([]);
	private latestBalanceByAsset = new SvelteMap<string, LatestAssetBalance>();
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;
	private refreshSequence = 0;
	private mutationEpoch = 0;
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
		const userId = this.currentUserId;
		await this._pb.postJson('/api/shares/assets', {
			assetId,
			recipientEmail,
			perspective
		});
		await this.refreshShares(userId);
		if (await this.refreshAsset(assetId, userId)) this.lastBalanceEvent = Date.now();
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		const userId = this.currentUserId;
		const share = await this._pb.authedClient
			.collection('assetShares')
			.update<AssetSharesResponse>(shareId, { includeInNetWorth });
		await this.refreshShares(userId);
		if (await this.refreshAsset(share.asset, userId)) this.lastBalanceEvent = Date.now();
	}

	async revokeShare(shareId: string) {
		const userId = this.currentUserId;
		const assetId = this.shares.find((share) => share.id === shareId)?.asset;
		await this._pb.authedClient.collection('assetShares').delete(shareId);
		await this.refreshShares(userId);
		if (assetId && (await this.refreshAsset(assetId, userId))) {
			this.lastBalanceEvent = Date.now();
		}
	}

	private init() {
		$effect(() => {
			const userId = this.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._activeUserId = userId;
			if (!userId) {
				this.refreshSequence++;
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
			void this.refreshForCurrentUser();
		});
	}

	private async refreshForCurrentUser() {
		const userId = this.currentUserId;
		const token = ++this.refreshSequence;
		try {
			await this.refreshShares(userId, token);
			await this.refreshAssets(userId, token);
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			if (userId !== this.currentUserId || token !== this.refreshSequence) return;
			this._pb.handleConnectionError(error, 'assets', 'init');
		} finally {
			if (userId === this.currentUserId && token === this.refreshSequence) this.isLoading = false;
		}
	}

	private async refreshShares(userId = this.currentUserId, token = this.refreshSequence) {
		if (!userId || userId !== this.currentUserId || token !== this.refreshSequence) return;
		const shares = await this._pb.authedClient.collection('assetShares').getFullList({
			sort: 'recipientEmail',
			requestKey: null
		});
		if (userId !== this.currentUserId || token !== this.refreshSequence) return;
		this.shares = shares;
	}

	private async refreshAssets(userId = this.currentUserId, token = this.refreshSequence) {
		if (!userId || userId !== this.currentUserId || token !== this.refreshSequence) return;
		const epoch = this.mutationEpoch;
		const list = await this._pb.authedClient.collection('assets').getFullList<AssetsResponse>({
			requestKey: null
		});
		for (const asset of list) {
			await this.balanceTypesContext.ensureLoaded(asset.balanceType);
		}
		const latestBalances = await Promise.all(
			list.map((asset) => this.getLatestAssetBalance(asset.id))
		);
		if (userId !== this.currentUserId || token !== this.refreshSequence) return;

		// NOTE: A targeted membership mutation landed while this list was in
		// flight, so the fetched snapshot is stale; leave membership and
		// balances to the mutation rather than overwriting with stale state.
		if (epoch === this.mutationEpoch) {
			this.latestBalanceByAsset.clear();
			list.forEach((asset, index) => {
				const balance = latestBalances[index];
				if (balance) this.latestBalanceByAsset.set(asset.id, balance);
			});
			this.rawAssets = list;
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('assets')
			.subscribe<AssetsResponse>('*', (event) => {
				void this.onAssetEvent(event, userId).catch((error) => {
					if (userId === this.currentUserId) {
						this._pb.handleConnectionError(error, 'assets', 'asset_event');
					} else {
						logError('assetsStore', 'stale_event', error);
					}
				});
			})
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'assets', 'subscribe_assets');
				} else {
					logError('assetsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('assetBalances')
			.subscribe<AssetBalancesResponse>('*', (event) => this.onAssetBalanceEvent(event, userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'assets', 'subscribe_balances');
				} else {
					logError('assetsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('assetShares')
			.subscribe<AssetSharesResponse>('*', (event) => this.onAssetShareEvent(event, userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'assets', 'subscribe_shares');
				} else {
					logError('assetsStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('assets').unsubscribe('*');
		this._pb.authedClient.collection('assetBalances').unsubscribe('*');
		this._pb.authedClient.collection('assetShares').unsubscribe('*');
	}

	private async onAssetEvent(e: RecordSubscription<AssetsResponse>, userId: string) {
		if (userId !== this.currentUserId) return;

		if (e.action === 'create') {
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			const balanceData = await this.getLatestAssetBalance(e.record.id);
			if (userId !== this.currentUserId) return;
			this.upsertAssetRecord(e.record);
			if (balanceData) this.latestBalanceByAsset.set(e.record.id, balanceData);
		} else if (e.action === 'update') {
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			if (userId !== this.currentUserId) return;
			this.upsertAssetRecord(e.record);
			if (!this.latestBalanceByAsset.has(e.record.id)) {
				const balanceData = await this.getLatestAssetBalance(e.record.id);
				if (userId !== this.currentUserId) return;
				if (balanceData) this.latestBalanceByAsset.set(e.record.id, balanceData);
			}
		} else if (e.action === 'delete') {
			this.removeAssetRecord(e.record.id);
			this.latestBalanceByAsset.delete(e.record.id);
		}
	}

	private onAssetBalanceEvent(e: RecordSubscription<AssetBalancesResponse>, userId: string) {
		if (userId !== this.currentUserId) return;
		if (!e.action) return;
		const assetId = e.record.asset;
		let displayedAssetId: string | null = null;
		for (const [key, currentBalance] of this.latestBalanceByAsset) {
			if (currentBalance.id === e.record.id) {
				displayedAssetId = key;
				break;
			}
		}
		if (displayedAssetId && displayedAssetId !== assetId) {
			void this.refetchAssetBalance(displayedAssetId, userId);
		}

		if (e.action === 'create' || e.action === 'update') {
			const asset = this.rawAssets.find((x) => x.id === assetId);
			if (!asset) {
				void this.refreshAsset(assetId, userId)
					.then((refreshed) => {
						if (userId !== this.currentUserId) return;
						if (refreshed) this.lastBalanceEvent = Date.now();
					})
					.catch((error) => {
						if (userId === this.currentUserId) {
							this._pb.handleConnectionError(error, 'assets', 'balance');
						} else {
							logError('assetsStore', 'stale_event', error);
						}
					});
				return;
			}

			const current = this.latestBalanceByAsset.get(assetId);
			if (current?.id === e.record.id) {
				void this.refetchAssetBalance(assetId, userId);
				return;
			}

			if (!current || this.isAtLeastAsRecent(e.record, current)) {
				this.latestBalanceByAsset.set(assetId, this.toLatestAssetBalance(e.record));
				this.lastBalanceEvent = Date.now();
			}
		} else if (e.action === 'delete' && displayedAssetId === assetId) {
			void this.refetchAssetBalance(assetId, userId);
		}
	}

	private onAssetShareEvent(e: RecordSubscription<AssetSharesResponse>, userId: string) {
		if (userId !== this.currentUserId) return;

		if (e.action === 'create') {
			this.shares = [...this.shares, e.record];
		} else if (e.action === 'update') {
			this.shares = this.shares.map((share) => (share.id === e.record.id ? e.record : share));
		} else if (e.action === 'delete') {
			this.shares = this.shares.filter((share) => share.id !== e.record.id);
		}

		void this.refreshAsset(e.record.asset, userId)
			.then((refreshed) => {
				if (userId !== this.currentUserId) return;
				if (refreshed) this.lastBalanceEvent = Date.now();
			})
			.catch((error) => {
				if (userId === this.currentUserId) {
					this._pb.handleConnectionError(error, 'assets', 'share');
				} else {
					logError('assetsStore', 'stale_event', error);
				}
			});
	}

	private computeBalanceData(
		balance: Pick<AssetBalancesResponse, 'asOf' | 'bookValue' | 'marketValue'>,
		perspective: AssetSharesPerspectiveOptions
	) {
		const projected = projectAssetFinancials(balance.bookValue, balance.marketValue, perspective);
		return {
			...projected,
			balanceAsOf: balance.asOf
		};
	}

	private toAssetWithBalance(asset: AssetsResponse, rawBalanceData: AssetBalanceData) {
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
				perspective
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

	private async refetchAssetBalance(assetId: string, userId: string) {
		if (userId !== this.currentUserId) return;

		try {
			const balanceData = await this.getLatestAssetBalance(assetId);
			if (userId !== this.currentUserId) return;
			if (balanceData) this.latestBalanceByAsset.set(assetId, balanceData);
			else this.latestBalanceByAsset.delete(assetId);
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			if (userId === this.currentUserId) {
				logError('assets', 'refetch_balance', error);
			} else {
				logError('assetsStore', 'stale_event', error);
			}
		}
	}

	// NOTE: Targeted membership changes bump mutationEpoch so an in-flight
	// refreshAssets that fetched its list before this mutation aborts its
	// commit and can't overwrite newer state with a stale snapshot.
	private upsertAssetRecord(asset: AssetsResponse) {
		const { list, inserted } = upsertById(this.rawAssets, asset);
		this.rawAssets = list;
		if (inserted) this.mutationEpoch++;
	}

	private removeAssetRecord(assetId: string) {
		const { list, removed } = removeById(this.rawAssets, assetId);
		this.rawAssets = list;
		if (removed) this.mutationEpoch++;
	}

	private async refreshAsset(assetId: string, userId: string) {
		if (userId !== this.currentUserId) return false;

		try {
			const asset = await this._pb.authedClient
				.collection('assets')
				.getOne<AssetsResponse>(assetId, { requestKey: null });
			if (userId !== this.currentUserId) return false;
			await this.balanceTypesContext.ensureLoaded(asset.balanceType);
			if (userId !== this.currentUserId) return false;
			const balanceData = await this.getLatestAssetBalance(assetId);
			if (userId !== this.currentUserId) return false;
			this.upsertAssetRecord(asset);
			if (balanceData) this.latestBalanceByAsset.set(assetId, balanceData);
			else this.latestBalanceByAsset.delete(assetId);
			return true;
		} catch (error) {
			if (userId !== this.currentUserId) return false;
			if (isUnavailableRecordError(error)) {
				this.removeAssetRecord(assetId);
				this.latestBalanceByAsset.delete(assetId);
				return true;
			}
			throw error;
		}
	}

	private async getLatestAssetBalance(assetId: string) {
		const res = await this._pb.authedClient
			.collection('assetBalances')
			.getList<AssetBalancesResponse>(1, 1, {
				filter: `asset='${assetId}'`,
				sort: '-asOf,-created,-id',
				requestKey: null
			});
		const balance = res.items[0];
		return balance ? this.toLatestAssetBalance(balance) : null;
	}

	private toLatestAssetBalance(balance: AssetBalancesResponse) {
		return {
			id: balance.id,
			marketValue: balance.marketValue ?? 0,
			bookValue: balance.bookValue ?? 0,
			gain: (balance.marketValue ?? 0) - (balance.bookValue ?? 0),
			gainPercent:
				(balance.bookValue ?? 0) !== 0
					? (((balance.marketValue ?? 0) - (balance.bookValue ?? 0)) /
							Math.abs(balance.bookValue ?? 0)) *
						100
					: 0,
			balanceAsOf: balance.asOf,
			created: balance.created
		};
	}

	private isAtLeastAsRecent(
		balance: Pick<AssetBalancesResponse, 'asOf' | 'created' | 'id'>,
		current: Pick<LatestAssetBalance, 'balanceAsOf' | 'created' | 'id'>
	) {
		if (balance.asOf !== current.balanceAsOf) return balance.asOf > current.balanceAsOf;
		if (balance.created !== current.created) return balance.created > current.created;
		return balance.id >= current.id;
	}

	dispose() {
		this.refreshSequence++;
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this.unsubscribeRealtime();
	}
}

export const CONTEXT_KEY_ASSETS = 'assets';

export function setAssetsContext(
	pb: PocketBaseContext,
	balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
) {
	return setContext(CONTEXT_KEY_ASSETS, new AssetsContext(pb, balanceTypesContext));
}

export function getAssetsContext() {
	return getContext<ReturnType<typeof setAssetsContext>>(CONTEXT_KEY_ASSETS);
}
