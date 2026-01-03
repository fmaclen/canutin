import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { setBalanceTypesContext } from './balance-types.svelte';
import type { AssetBalancesResponse, AssetsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

type AssetBalanceData = {
	marketValue: number;
	bookValue: number;
	gain: number;
	gainPercent: number;
	quantity?: number;
	bookPrice?: number;
	marketPrice?: number;
	balanceAsOf: string;
};

const DEFAULT_BALANCE_DATA: AssetBalanceData = {
	marketValue: 0,
	bookValue: 0,
	gain: 0,
	gainPercent: 0,
	quantity: undefined,
	bookPrice: undefined,
	marketPrice: undefined,
	balanceAsOf: ''
};

export type AssetWithBalance = AssetsResponse & AssetBalanceData;

class AssetsContext {
	assets: AssetWithBalance[] = $state([]);
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

	getTypeName(id: string) {
		return this.balanceTypesContext.getName(id);
	}

	getAsset(id: string): AssetWithBalance | undefined {
		return this.assets.find((a) => a.id === id);
	}

	async deleteAsset(id: string) {
		await this._pb.authedClient.collection('assets').delete(id);
	}

	private async init() {
		try {
			// Subscribe FIRST to avoid missing events during initial fetch
			this.realtimeSubscribe();

			const list = await this._pb.authedClient.collection('assets').getFullList<AssetsResponse>();
			this.assets = list.map((a) => ({ ...a, ...DEFAULT_BALANCE_DATA }));
			for (const a of this.assets) {
				const balanceData = await this.getLatestAssetBalance(a.id);
				this.assets = this.assets.map((x) => (x.id === a.id ? { ...x, ...balanceData } : x));
			}
			this.lastBalanceEvent = Date.now();
			this.isLoading = false;
		} catch (error) {
			this._pb.handleConnectionError(error, 'assets', 'init');
			this.isLoading = false;
		}
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
	}

	private async onAssetEvent(e: RecordSubscription<AssetsResponse>) {
		if (e.action === 'create') {
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.assets = [...this.assets, { ...e.record, ...DEFAULT_BALANCE_DATA }];
		} else if (e.action === 'update') {
			const existing = this.assets.find((a) => a.id === e.record.id);
			const balanceData: AssetBalanceData = {
				marketValue: existing?.marketValue ?? 0,
				bookValue: existing?.bookValue ?? 0,
				gain: existing?.gain ?? 0,
				gainPercent: existing?.gainPercent ?? 0,
				quantity: existing?.quantity,
				bookPrice: existing?.bookPrice,
				marketPrice: existing?.marketPrice,
				balanceAsOf: existing?.balanceAsOf ?? ''
			};
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.assets = this.assets.map((x) =>
				x.id === e.record.id ? { ...e.record, ...balanceData } : x
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
			// Optimistic update: use the value from the event directly.
			// If asset isn't loaded yet (event arrived during initial fetch), we ignore it.
			// This is safe because init() fetches the latest balance for each asset after loading.
			const asset = this.assets.find((x) => x.id === assetId);
			if (!asset) return;

			// Only update if this balance is newer than what we have.
			// String comparison works because ISO 8601 dates are lexicographically sortable.
			if (!asset.balanceAsOf || newAsOf >= asset.balanceAsOf) {
				const balanceData = this.computeBalanceData(e.record);
				this.assets = this.assets.map((x) => (x.id === assetId ? { ...x, ...balanceData } : x));
				this.lastBalanceEvent = Date.now();
			}
		} else if (e.action === 'delete') {
			// When a balance is deleted, we need to re-fetch to get the next most recent
			this.refetchAssetBalance(assetId);
		}
	}

	private computeBalanceData(balance: AssetBalancesResponse): AssetBalanceData {
		const marketValue = balance.marketValue ?? 0;
		const bookValue = balance.bookValue ?? 0;
		const gain = marketValue - bookValue;
		const gainPercent = bookValue !== 0 ? (gain / bookValue) * 100 : 0;
		return {
			marketValue,
			bookValue,
			gain,
			gainPercent,
			quantity: balance.quantity,
			bookPrice: balance.bookPrice,
			marketPrice: balance.marketPrice,
			balanceAsOf: balance.asOf
		};
	}

	private async refetchAssetBalance(assetId: string) {
		try {
			const balanceData = await this.getLatestAssetBalance(assetId);
			this.assets = this.assets.map((x) => (x.id === assetId ? { ...x, ...balanceData } : x));
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
		return this.computeBalanceData(balance);
	}

	dispose() {
		this._pb.authedClient.collection('assets').unsubscribe();
		this._pb.authedClient.collection('assetBalances').unsubscribe();
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
