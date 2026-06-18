import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import type { BalanceTypesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

class BalanceTypesContext {
	byId: Record<string, BalanceTypesResponse> = $state({});

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this.init();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._activeUserId = userId;
			if (!userId) {
				this.byId = {};
				return;
			}
			this.realtimeSubscribe(userId);
			void this.refreshForCurrentUser(userId);
		});
	}

	private async refreshForCurrentUser(userId: string) {
		try {
			const list = await this._pb.authedClient
				.collection('balanceTypes')
				.getFullList<BalanceTypesResponse>();
			if (userId !== this._activeUserId) return;
			const map: Record<string, BalanceTypesResponse> = {};
			for (const bt of list) map[bt.id] = bt;
			this.byId = map;
		} catch (error) {
			if (userId !== this._activeUserId) return;
			this._pb.handleConnectionError(error, 'balance_types', 'init');
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;
		this._isSubscribed = true;
		this._pb.authedClient
			.collection('balanceTypes')
			.subscribe('*', this.onEvent.bind(this))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'balance_types', 'subscribe');
				} else {
					console.error('[balanceTypesStore] Stale subscription failed:', error);
				}
			});
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('balanceTypes').unsubscribe('*');
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
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this.unsubscribeRealtime();
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
