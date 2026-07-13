import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import { logError } from './logger';
import type { BalanceTypesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';

const DEBOUNCE_MS = 200;

class BalanceTypesContext {
	byId: Record<string, BalanceTypesResponse> = $state({});

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private sequence = new RequestSequence();
	private debouncer = new Debouncer(DEBOUNCE_MS);
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _reconnectCallback = () => this.invalidate();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._pb.registerRealtimeReconnect(this._reconnectCallback);
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
			this.debouncer.cancel();
			this.sequence.bump();
			this._activeUserId = userId;
			if (!userId) {
				this.byId = {};
				return;
			}
			this.realtimeSubscribe(userId);
			void this.refreshForCurrentUser();
		});
	}

	// Realtime events and reconnects are pure invalidation signals: they schedule a debounced full
	// refetch of the dictionary rather than patching a single record from the event payload.
	private invalidate() {
		this.debouncer.schedule(() => void this.refreshForCurrentUser());
	}

	private async refreshForCurrentUser() {
		const userId = this.currentUserId;
		const token = this.sequence.next();
		try {
			const list = await this._pb.authedClient
				.collection('balanceTypes')
				.getFullList<BalanceTypesResponse>({ requestKey: null });
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;
			const map: Record<string, BalanceTypesResponse> = {};
			for (const bt of list) map[bt.id] = bt;
			this.byId = map;
		} catch (error) {
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;
			this._pb.handleConnectionError(error, 'balance_types', 'refresh');
		}
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
		this.invalidate();
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

	async ensureLoaded(id: string) {
		if (!id || this.byId[id]) return;
		try {
			const bt = await this._pb.authedClient
				.collection('balanceTypes')
				.getOne<BalanceTypesResponse>(id);
			this.byId = { ...this.byId, [bt.id]: bt };
		} catch (error) {
			logError('balanceTypes', 'ensure_loaded', error);
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
		this.debouncer.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeReconnect(this._reconnectCallback);
		this.unsubscribeRealtime();
		this.sequence.bump();
	}
}

export function setBalanceTypesContext(pb: PocketBaseContext) {
	return setContext('balance-types', new BalanceTypesContext(pb));
}

export function getBalanceTypesContext() {
	return getContext<ReturnType<typeof setBalanceTypesContext>>('balance-types');
}
