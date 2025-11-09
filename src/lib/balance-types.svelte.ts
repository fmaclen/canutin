import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import type { BalanceTypesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

class BalanceTypesContext {
	byId: Record<string, BalanceTypesResponse> = $state({});

	private _pb: PocketBaseContext;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this.init();
	}

	private async init() {
		try {
			const list = await this._pb.authedClient
				.collection('balanceTypes')
				.getFullList<BalanceTypesResponse>();
			const map: Record<string, BalanceTypesResponse> = {};
			for (const bt of list) map[bt.id] = bt;
			this.byId = map;
			this.realtimeSubscribe();
		} catch (error) {
			this._pb.handleConnectionError(error, 'balance_types', 'init');
		}
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('balanceTypes')
			.subscribe('*', this.onEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'balance_types', 'subscribe'));
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
			const bt = await this._pb.authedClient
				.collection('balanceTypes')
				.getOne<BalanceTypesResponse>(id);
			this.byId = { ...this.byId, [bt.id]: bt };
		} catch (error) {
			console.error('[balance_types:ensure_loaded]', error);
		}
	}

	async getOrCreate(name: string, ownerId: string): Promise<string> {
		const trimmed = name.trim();
		if (!trimmed) throw new Error('Balance type name is required');

		const existing = Object.values(this.byId).find((bt) => bt.name === trimmed);
		if (existing) return existing.id;

		const created = await this._pb.authedClient.collection('balanceTypes').create({
			name: trimmed,
			owner: ownerId
		});
		this.byId = { ...this.byId, [created.id]: created };
		return created.id;
	}

	dispose() {
		this._pb.authedClient.collection('balanceTypes').unsubscribe();
	}
}

export const CONTEXT_KEY_BALANCE_TYPES = 'balance-types';

export function setBalanceTypesContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_BALANCE_TYPES, new BalanceTypesContext(pb));
}

export function getBalanceTypesContext() {
	return getContext<ReturnType<typeof setBalanceTypesContext>>(CONTEXT_KEY_BALANCE_TYPES);
}

export function getOrCreateBalanceTypesContext(pb: PocketBaseContext) {
	let ctx = getContext<ReturnType<typeof setBalanceTypesContext>>(CONTEXT_KEY_BALANCE_TYPES);
	if (!ctx) ctx = setBalanceTypesContext(pb);
	return ctx;
}
