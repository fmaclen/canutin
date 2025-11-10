import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { setBalanceTypesContext } from './balance-types.svelte';
import type { AssetBalancesResponse, AssetsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

export type AssetWithBalance = AssetsResponse & {
	marketValue: number;
	bookValue: number;
	gain: number;
	gainPercent: number;
	quantity?: number;
	bookPrice?: number;
	marketPrice?: number;
};

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
			const list = await this._pb.authedClient.collection('assets').getFullList<AssetsResponse>();
			this.assets = list.map((a) => ({
				...a,
				marketValue: 0,
				bookValue: 0,
				gain: 0,
				gainPercent: 0,
				quantity: undefined,
				bookPrice: undefined,
				marketPrice: undefined
			}));
			for (const a of this.assets) {
				const balanceData = await this.getLatestAssetBalance(a.id);
				this.assets = this.assets.map((x) => (x.id === a.id ? { ...x, ...balanceData } : x));
			}
			this.lastBalanceEvent = Date.now();
			this.realtimeSubscribe();
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
			this.assets = [
				...this.assets,
				{
					...e.record,
					marketValue: 0,
					bookValue: 0,
					gain: 0,
					gainPercent: 0,
					quantity: undefined,
					bookPrice: undefined,
					marketPrice: undefined
				}
			];
		} else if (e.action === 'update') {
			const existing = this.assets.find((a) => a.id === e.record.id);
			const balanceData = {
				marketValue: existing?.marketValue ?? 0,
				bookValue: existing?.bookValue ?? 0,
				gain: existing?.gain ?? 0,
				gainPercent: existing?.gainPercent ?? 0,
				quantity: existing?.quantity,
				bookPrice: existing?.bookPrice,
				marketPrice: existing?.marketPrice
			};
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.assets = this.assets.map((x) =>
				x.id === e.record.id ? { ...e.record, ...balanceData } : x
			);
		} else if (e.action === 'delete') {
			this.assets = this.assets.filter((x) => x.id !== e.record.id);
		}
	}

	private async onAssetBalanceEvent(e: RecordSubscription<AssetBalancesResponse>) {
		if (!e.action) return;
		const assetId = e.record.asset;
		try {
			const balanceData = await this.getLatestAssetBalance(assetId);
			this.assets = this.assets.map((x) => (x.id === assetId ? { ...x, ...balanceData } : x));
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			console.error('[assets:update_balance_on_event]', error);
		}
	}

	private async getLatestAssetBalance(assetId: string) {
		const res = await this._pb.authedClient
			.collection('assetBalances')
			.getList<AssetBalancesResponse>(1, 1, {
				filter: `asset='${assetId}'`,
				sort: '-asOf,-created,-id'
			});
		const balance = res.items[0];
		const marketValue = balance?.marketValue ?? 0;
		const bookValue = balance?.bookValue ?? 0;
		const gain = marketValue - bookValue;
		const gainPercent = bookValue !== 0 ? (gain / bookValue) * 100 : 0;
		return {
			marketValue,
			bookValue,
			gain,
			gainPercent,
			quantity: balance?.quantity,
			bookPrice: balance?.bookPrice,
			marketPrice: balance?.marketPrice
		};
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
