import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { setBalanceTypesContext } from './balance-types.svelte';
import {
	AssetSharesAccessRoleOptions,
	AssetSharesPerspectiveOptions,
	type AssetBalancesResponse,
	type AssetSharesResponse,
	type AssetsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { participantExcluded, projectAssetFinancials } from './sharing';

type AssetBalanceData = {
	marketValue: number;
	bookValue: number;
	gain: number;
	gainPercent: number;
	balanceAsOf: string;
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
	assets: AssetWithBalance[] = $state([]);
	shares: AssetSharesResponse[] = $state([]);
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;

	constructor(
		pb: PocketBaseContext,
		balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
	) {
		this._pb = pb;
		this.balanceTypesContext = balanceTypesContext;
		this.init();
	}

	private get currentUserId() {
		return this._pb.authedClient.authStore.record?.id ?? '';
	}

	getTypeName(id: string) {
		return this.balanceTypesContext.getName(id);
	}

	getAsset(id: string): AssetWithBalance | undefined {
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
		await this.refreshShares();
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		await this._pb.authedClient.collection('assetShares').update(shareId, { includeInNetWorth });
		await this.refreshShares();
		await this.refreshAssets();
	}

	async revokeShare(shareId: string) {
		await this._pb.authedClient.collection('assetShares').delete(shareId);
		await this.refreshShares();
	}

	private async init() {
		try {
			this.realtimeSubscribe();
			await this.refreshShares();
			await this.refreshAssets();
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			this._pb.handleConnectionError(error, 'assets', 'init');
		} finally {
			this.isLoading = false;
		}
	}

	private async refreshShares() {
		this.shares = await this._pb.authedClient.collection('assetShares').getFullList({
			sort: 'recipientEmail',
			requestKey: null
		});
	}

	private async refreshAssets() {
		const list = await this._pb.authedClient.collection('assets').getFullList<AssetsResponse>({
			requestKey: null
		});
		const next: AssetWithBalance[] = [];
		for (const asset of list) {
			await this.balanceTypesContext.ensureLoaded(asset.balanceType);
			const balanceData = await this.getLatestAssetBalance(asset.id);
			next.push(this.toAssetWithBalance(asset, balanceData));
		}
		this.assets = next;
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('assets')
			.subscribe('*', this.onAssetEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'assets', 'subscribe_assets'));
		this._pb.authedClient
			.collection('assetBalances')
			.subscribe('*', this.onAssetBalanceEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'assets', 'subscribe_balances'));
		this._pb.authedClient
			.collection('assetShares')
			.subscribe('*', this.onAssetShareEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'assets', 'subscribe_shares'));
	}

	private async onAssetEvent(e: RecordSubscription<AssetsResponse>) {
		if (e.action === 'create') {
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			const balanceData = await this.getLatestAssetBalance(e.record.id);
			this.assets = [...this.assets, this.toAssetWithBalance(e.record, balanceData)];
		} else if (e.action === 'update') {
			const existing = this.assets.find((a) => a.id === e.record.id);
			const balanceData = existing
				? this.toRawBalanceData(existing)
				: await this.getLatestAssetBalance(e.record.id);
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.assets = this.assets.map((x) =>
				x.id === e.record.id ? this.toAssetWithBalance(e.record, balanceData) : x
			);
		} else if (e.action === 'delete') {
			this.assets = this.assets.filter((x) => x.id !== e.record.id);
		}
	}

	private onAssetBalanceEvent(e: RecordSubscription<AssetBalancesResponse>) {
		if (!e.action) return;
		const assetId = e.record.asset;
		const newAsOf = e.record.asOf;

		if (e.action === 'create' || e.action === 'update') {
			const asset = this.assets.find((x) => x.id === assetId);
			if (!asset) {
				void this.refreshAssets().then(() => {
					this.lastBalanceEvent = Date.now();
				});
				return;
			}

			if (!asset.balanceAsOf || newAsOf >= asset.balanceAsOf) {
				this.assets = this.assets.map((x) =>
					x.id === assetId
						? {
								...x,
								...this.computeBalanceData(e.record, x.perspective)
							}
						: x
				);
				this.lastBalanceEvent = Date.now();
			}
		} else if (e.action === 'delete') {
			void this.refetchAssetBalance(assetId);
		}
	}

	private async onAssetShareEvent(e: RecordSubscription<AssetSharesResponse>) {
		if (e.action === 'create') {
			this.shares = [...this.shares, e.record];
		} else if (e.action === 'update') {
			this.shares = this.shares.map((share) => (share.id === e.record.id ? e.record : share));
		} else if (e.action === 'delete') {
			this.shares = this.shares.filter((share) => share.id !== e.record.id);
		}

		await this.refreshAssets();
		this.lastBalanceEvent = Date.now();
	}

	private computeBalanceData(
		balance: Pick<AssetBalancesResponse, 'asOf' | 'bookValue' | 'marketValue'>,
		perspective: AssetSharesPerspectiveOptions
	): AssetBalanceData {
		const projected = projectAssetFinancials(balance.bookValue, balance.marketValue, perspective);
		return {
			...projected,
			balanceAsOf: balance.asOf
		};
	}

	private toRawBalanceData(asset: AssetWithBalance): AssetBalanceData {
		const rawBookValue =
			asset.perspective === 'INVERSE' ? -(asset.bookValue ?? 0) : (asset.bookValue ?? 0);
		const rawMarketValue =
			asset.perspective === 'INVERSE' ? -(asset.marketValue ?? 0) : (asset.marketValue ?? 0);
		return {
			marketValue: rawMarketValue,
			bookValue: rawBookValue,
			gain: rawMarketValue - rawBookValue,
			gainPercent:
				rawBookValue !== 0 ? ((rawMarketValue - rawBookValue) / Math.abs(rawBookValue)) * 100 : 0,
			balanceAsOf: asset.balanceAsOf
		};
	}

	private toAssetWithBalance(
		asset: AssetsResponse,
		rawBalanceData: AssetBalanceData
	): AssetWithBalance {
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

	private async refetchAssetBalance(assetId: string) {
		try {
			const balanceData = await this.getLatestAssetBalance(assetId);
			this.assets = this.assets.map((x) =>
				x.id === assetId
					? {
							...x,
							...this.computeBalanceData(
								{
									asOf: balanceData.balanceAsOf,
									bookValue: balanceData.bookValue,
									marketValue: balanceData.marketValue
								},
								x.perspective
							)
						}
					: x
			);
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			console.error('[assets:refetch_balance]', error);
		}
	}

	private async getLatestAssetBalance(assetId: string): Promise<AssetBalanceData> {
		const res = await this._pb.authedClient
			.collection('assetBalances')
			.getList<AssetBalancesResponse>(1, 1, {
				filter: `asset='${assetId}'`,
				sort: '-asOf,-created,-id'
			});
		const balance = res.items[0];
		if (!balance) return DEFAULT_BALANCE_DATA;
		return {
			marketValue: balance.marketValue ?? 0,
			bookValue: balance.bookValue ?? 0,
			gain: (balance.marketValue ?? 0) - (balance.bookValue ?? 0),
			gainPercent:
				(balance.bookValue ?? 0) !== 0
					? (((balance.marketValue ?? 0) - (balance.bookValue ?? 0)) /
							Math.abs(balance.bookValue ?? 0)) *
						100
					: 0,
			balanceAsOf: balance.asOf
		};
	}

	dispose() {
		this._pb.authedClient.collection('assets').unsubscribe();
		this._pb.authedClient.collection('assetBalances').unsubscribe();
		this._pb.authedClient.collection('assetShares').unsubscribe();
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
