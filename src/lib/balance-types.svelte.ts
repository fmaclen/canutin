import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import { logError } from './logger';
import type { BalanceTypesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { StaleSync } from './realtime-sync';

class BalanceTypesContext {
	byId: Record<string, BalanceTypesResponse> = $state({});

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private sync: StaleSync;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this.sync = new StaleSync(pb, 'balance_types', 'refresh', (token) => this.refreshAll(token));
		this._pb.registerRealtimeSync(this.sync);
		this.init();
	}

	private get currentUserId() {
		return this._auth.currentUserId;
	}

	private init() {
		$effect(() => {
			const userId = this.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.sync.cancel();
			this._activeUserId = userId;
			if (!userId) {
				this.byId = {};
				return;
			}
			this.realtimeSubscribe(userId);
			void this.sync.refreshNow();
		});
	}

	// Realtime events and reconnects are pure invalidation signals: they mark the store stale and
	// schedule a full refetch of the dictionary rather than patching a single record from the payload.
	private async refreshAll(token: number) {
		const userId = this.currentUserId;
		const list = await this._pb.authedClient
			.collection('balanceTypes')
			.getFullList<BalanceTypesResponse>({ requestKey: null });
		if (userId !== this.currentUserId || !this.sync.isCurrent(token)) return;
		const map: Record<string, BalanceTypesResponse> = {};
		for (const bt of list) map[bt.id] = bt;
		this.byId = map;
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;
		this._isSubscribed = true;
		this._pb.authedClient
			.collection('balanceTypes')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'balance_types', 'subscribe');
				} else {
					logError('balanceTypesStore', 'stale_subscription', error);
				}
			});
	}

	private onRealtimeEvent(userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		this.sync.invalidate();
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('balanceTypes').unsubscribe('*');
	}

	getName(id: string | undefined | null) {
		if (!id) return '(Unknown)';
		return this.byId[id]?.name ?? '(Unknown)';
	}

	// Awaited inside the accounts and assets refresh loops, so a failure here must propagate: a
	// swallowed one would let those stores commit a snapshot whose type names all read "(Unknown)"
	// and clear their stale flag on it.
	async ensureLoaded(id: string) {
		if (!id || this.byId[id]) return;
		const bt = await this._pb.authedClient
			.collection('balanceTypes')
			.getOne<BalanceTypesResponse>(id, { requestKey: null });
		this.byId = { ...this.byId, [bt.id]: bt };
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
		this.sync.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeSync(this.sync);
		this.unsubscribeRealtime();
	}
}

export function setBalanceTypesContext(pb: PocketBaseContext) {
	return setContext('balance-types', new BalanceTypesContext(pb));
}

export function getBalanceTypesContext() {
	return getContext<ReturnType<typeof setBalanceTypesContext>>('balance-types');
}
