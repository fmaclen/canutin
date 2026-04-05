import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import type { ImportSessionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

class ImportSessionsContext {
	sessions: ImportSessionsResponse[] = $state([]);
	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this.init();
	}

	private async init() {
		try {
			this.realtimeSubscribe();

			this.sessions = await this._pb.authedClient
				.collection('importSessions')
				.getFullList<ImportSessionsResponse>({ sort: '-created' });
			this.isLoading = false;
		} catch (error) {
			this._pb.handleConnectionError(error, 'importSessions', 'init');
			this.isLoading = false;
		}
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('importSessions')
			.subscribe('*', this.onSessionEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'importSessions', 'subscribe'));
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
		this._pb.authedClient.collection('importSessions').unsubscribe();
	}
}

const CONTEXT_KEY = 'import-sessions';

export function setImportSessionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY, new ImportSessionsContext(pb));
}

export function getImportSessionsContext() {
	return getContext<ReturnType<typeof setImportSessionsContext>>(CONTEXT_KEY);
}
