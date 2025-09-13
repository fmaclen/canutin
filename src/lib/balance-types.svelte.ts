import PocketBase, { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import type { BalanceTypesResponse } from './pocketbase.schema';

class BalanceTypesContext {
	byId: Record<string, BalanceTypesResponse> = $state({});

	private _pb: PocketBase;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.init();
	}

	private async init() {
		const list = await this._pb.collection('balanceTypes').getFullList<BalanceTypesResponse>();
		const map: Record<string, BalanceTypesResponse> = {};
		for (const bt of list) map[bt.id] = bt;
		this.byId = map;
		this.realtimeSubscribe();
	}

	private realtimeSubscribe() {
		this._pb.collection('balanceTypes').subscribe('*', this.onEvent.bind(this));
	}

	private onEvent(e: RecordSubscription<BalanceTypesResponse>) {
		if (e.action === 'create' || e.action === 'update') {
			this.byId = { ...this.byId, [e.record.id]: e.record };
		} else if (e.action === 'delete') {
			const next = { ...this.byId };
			delete next[e.record.id];
			this.byId = next;
		}
	}

	getName(id: string | undefined | null) {
		if (!id) return '(Unknown)';
		return this.byId[id]?.name ?? '(Unknown)';
	}

	async ensureLoaded(id: string) {
		if (!id || this.byId[id]) return;
		try {
			const bt = await this._pb.collection('balanceTypes').getOne<BalanceTypesResponse>(id);
			this.byId = { ...this.byId, [bt.id]: bt };
		} catch {
			// ignore
		}
	}

	dispose() {
		this._pb.collection('balanceTypes').unsubscribe();
	}
}

export const CONTEXT_KEY_BALANCE_TYPES = 'balance-types';

export function setBalanceTypesContext(pb: PocketBase) {
	return setContext(CONTEXT_KEY_BALANCE_TYPES, new BalanceTypesContext(pb));
}

export function getBalanceTypesContext() {
	return getContext<ReturnType<typeof setBalanceTypesContext>>(CONTEXT_KEY_BALANCE_TYPES);
}

export function getOrCreateBalanceTypesContext(pb: PocketBase) {
	let ctx = getContext<ReturnType<typeof setBalanceTypesContext>>(CONTEXT_KEY_BALANCE_TYPES);
	if (!ctx) ctx = setBalanceTypesContext(pb);
	return ctx;
}
