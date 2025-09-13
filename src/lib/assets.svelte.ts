import PocketBase, { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { getOrCreateBalanceTypesContext } from './balance-types.svelte';

import type { AssetBalancesResponse, AssetsResponse } from './pocketbase.schema';

type AssetWithBalance = AssetsResponse & { balance: number };

class AssetsContext {
	assets: AssetWithBalance[] = $state([]);
	assetsView = $derived.by(() =>
		this.assets.map((a) => ({ ...a, balanceTypeName: this._bt.getName(a.balanceType) }))
	);

	private _pb: PocketBase;
    private _bt: ReturnType<typeof getOrCreateBalanceTypesContext>;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this._bt = getOrCreateBalanceTypesContext(pb);
		this.init();
	}

	private async init() {
		const list = await this._pb.collection('assets').getFullList<AssetsResponse>();
		this.assets = list.map((a) => ({ ...a, balance: 0 }));
		for (const a of this.assets) {
			const value = await this.getLatestAssetBalance(a.id);
			this.assets = this.assets.map((x) => (x.id === a.id ? { ...x, balance: value } : x));
		}
		this.realtimeSubscribe();
	}

	private realtimeSubscribe() {
		this._pb.collection('assets').subscribe('*', this.onAssetEvent.bind(this));
		this._pb.collection('assetBalances').subscribe('*', this.onAssetBalanceEvent.bind(this));
	}

	private async onAssetEvent(e: RecordSubscription<AssetsResponse>) {
		if (e.action === 'create') {
			await this._bt.ensureLoaded(e.record.balanceType);
			this.assets = [...this.assets, { ...e.record, balance: 0 }];
		} else if (e.action === 'update') {
			const balance = this.assets.find((a) => a.id === e.record.id)?.balance ?? 0;
			await this._bt.ensureLoaded(e.record.balanceType);
			this.assets = this.assets.map((x) => (x.id === e.record.id ? { ...e.record, balance } : x));
		} else if (e.action === 'delete') {
			this.assets = this.assets.filter((x) => x.id !== e.record.id);
		}
	}

	private async onAssetBalanceEvent(e: RecordSubscription<AssetBalancesResponse>) {
		if (!e.action) return;
		const assetId = e.record.asset;
		const value = await this.getLatestAssetBalance(assetId);
		this.assets = this.assets.map((x) => (x.id === assetId ? { ...x, balance: value } : x));
	}

	private async getLatestAssetBalance(assetId: string) {
		const res = await this._pb.collection('assetBalances').getList<AssetBalancesResponse>(1, 1, {
			filter: `asset='${assetId}'`,
			sort: '-asOf,-created,-id'
		});
		return res.items[0]?.value ?? 0;
	}

	dispose() {
		this._pb.collection('assets').unsubscribe();
		this._pb.collection('assetBalances').unsubscribe();
	}
}

export const CONTEXT_KEY_ASSETS = 'assets';

export function setAssetsContext(pb: PocketBase) {
	return setContext(CONTEXT_KEY_ASSETS, new AssetsContext(pb));
}

export function getAssetsContext() {
	return getContext<ReturnType<typeof setAssetsContext>>(CONTEXT_KEY_ASSETS);
}
