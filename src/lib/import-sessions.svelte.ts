import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import type { ImportSessionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

class ImportSessionsContext {
	sessions: ImportSessionsResponse[] = $state([]);
	isLoading: boolean = $state(true);

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

	private get currentUserId() {
		return this._auth.currentUserId;
	}

	private init() {
		$effect(() => {
			const userId = this.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
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

	private async refreshForCurrentUser() {
		const userId = this.currentUserId;
		try {
			const sessions = await this._pb.authedClient
				.collection('importSessions')
				.getFullList<ImportSessionsResponse>({ sort: '-created' });
			if (userId !== this.currentUserId) return;
			this.sessions = sessions;
		} catch (error) {
			if (userId !== this.currentUserId) return;
			this._pb.handleConnectionError(error, 'importSessions', 'init');
		} finally {
			if (userId === this.currentUserId) this.isLoading = false;
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('importSessions')
			.subscribe('*', this.onSessionEvent.bind(this))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'importSessions', 'subscribe');
				} else {
					console.error('[importSessionsStore] Stale subscription failed:', error);
				}
			});
		this._isSubscribed = true;
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('importSessions').unsubscribe('*');
	}

	private onSessionEvent(e: RecordSubscription<ImportSessionsResponse>) {
		if (e.action === 'create') {
			this.sessions = [e.record, ...this.sessions];
		} else if (e.action === 'update') {
			this.sessions = this.sessions.map((s) => (s.id === e.record.id ? e.record : s));
		} else if (e.action === 'delete') {
			this.sessions = this.sessions.filter((s) => s.id !== e.record.id);
		}
	}

	dispose() {
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
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
