import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import { logError } from './logger';
import type { ImportSessionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { StaleSync } from './realtime-sync';

class ImportSessionsContext {
	sessions: ImportSessionsResponse[] = $state([]);
	isLoading: boolean = $state(true);

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
		this.sync = new StaleSync(pb, 'importSessions', 'refresh', (token) => this.refreshAll(token));
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
				this.sessions = [];
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.realtimeSubscribe(userId);
			void this.sync.refreshNow();
		});
	}

	// Realtime events and reconnects are pure invalidation signals: they mark the store stale and
	// schedule a full refetch sorted '-created', which reproduces the newest-first order without
	// patching the payload.
	private async refreshAll(token: number) {
		const userId = this.currentUserId;
		try {
			const sessions = await this._pb.authedClient
				.collection('importSessions')
				.getFullList<ImportSessionsResponse>({ sort: '-created', requestKey: null });
			if (userId !== this.currentUserId || !this.sync.isCurrent(token)) return;
			this.sessions = sessions;
		} finally {
			if (userId === this.currentUserId && this.sync.isCurrent(token)) this.isLoading = false;
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('importSessions')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'importSessions', 'subscribe');
				} else {
					logError('importSessionsStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private onRealtimeEvent(userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		this.sync.invalidate();
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('importSessions').unsubscribe('*');
	}

	dispose() {
		this.sync.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeSync(this.sync);
		this.unsubscribeRealtime();
	}
}

const CONTEXT_KEY = 'import-sessions';

export function setImportSessionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY, new ImportSessionsContext(pb));
}

export function getImportSessionsContext() {
	return getContext<ReturnType<typeof setImportSessionsContext>>(CONTEXT_KEY);
}
