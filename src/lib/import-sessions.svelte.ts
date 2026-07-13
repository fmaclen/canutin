import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import { logError } from './logger';
import type { ImportSessionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';

const DEBOUNCE_MS = 200;

class ImportSessionsContext {
	sessions: ImportSessionsResponse[] = $state([]);
	isLoading: boolean = $state(true);

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
				this.sessions = [];
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.realtimeSubscribe(userId);
			void this.refreshForCurrentUser();
		});
	}

	// Realtime events and reconnects are pure invalidation signals: they schedule a debounced full
	// refetch sorted '-created', which reproduces the newest-first order without patching the payload.
	private invalidate() {
		this.debouncer.schedule(() => void this.refreshForCurrentUser());
	}

	private async refreshForCurrentUser() {
		const userId = this.currentUserId;
		const token = this.sequence.next();
		try {
			const sessions = await this._pb.authedClient
				.collection('importSessions')
				.getFullList<ImportSessionsResponse>({ sort: '-created', requestKey: null });
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;
			this.sessions = sessions;
		} catch (error) {
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;
			this._pb.handleConnectionError(error, 'importSessions', 'refresh');
		} finally {
			if (userId === this.currentUserId && this.sequence.isCurrent(token)) this.isLoading = false;
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
		this.invalidate();
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('importSessions').unsubscribe('*');
	}

	dispose() {
		this.debouncer.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeReconnect(this._reconnectCallback);
		this.unsubscribeRealtime();
		this.sequence.bump();
	}
}

const CONTEXT_KEY = 'import-sessions';

export function setImportSessionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY, new ImportSessionsContext(pb));
}

export function getImportSessionsContext() {
	return getContext<ReturnType<typeof setImportSessionsContext>>(CONTEXT_KEY);
}
