import PocketBase, { ClientResponseError } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';

import { logError } from './logger';
import { m } from './paraglide/messages';
import type { TypedPocketBase } from './pocketbase.schema';
import type { StaleSync } from './realtime-sync';
import { getBackendUrl } from './utils';

export type SetupStatus = 'checking' | 'ready' | 'needs-setup' | 'unreachable';

enum ToastId {
	CONNECTION_ERROR = 'connection-error',
	SUBSCRIPTION_ERROR = 'subscription-error',
	AUTH_ERROR = 'auth-error'
}

export class PocketBaseContext {
	authedClient: TypedPocketBase;
	setupStatus: SetupStatus = $state('checking');
	onAuthInvalidated?: () => void;

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- never read in a reactive context
	private _syncs = new Set<StaleSync>();
	private _syncListening = false;
	private _probe: Promise<boolean> | null = null;
	// Fires on the two browser signals that a dead connection may be usable again: the network
	// coming back, and the tab becoming visible after a sleep/wake or a backgrounded stretch. While
	// hidden the tab is left alone - the visibility signal picks it up when the user returns.
	private _retryTrigger = () => {
		if (document.visibilityState !== 'visible') return;
		for (const sync of this._syncs) sync.retryNow();
	};

	constructor() {
		this.authedClient = new PocketBase(getBackendUrl());
	}

	// NOTE: the SDK resubmits subscriptions on realtime reconnect but never replays events emitted
	// while disconnected, so records shared to the user during that gap (e.g. a laptop wake or
	// network blip) stay invisible until a full re-init. The registry marks every store stale the
	// moment the socket drops, and the store stays stale until a refresh actually commits - so a
	// session converges without a logout/login even if the first few attempts fail.
	//
	// The SDK only reconnects when the EventSource reports a transport error, and EventSource has no
	// liveness detection: an offline network or a slept laptop routinely leaves the socket in an OPEN
	// state that never errors, so `onDisconnect` never fires and nothing would mark the stores stale.
	// The browser's `online` and `visibilitychange` signals are therefore part of the recovery
	// contract, not a nicety - they are the only trigger in the failing case.
	registerRealtimeSync(sync: StaleSync) {
		this._syncs.add(sync);
		if (this._syncListening) return;
		this._syncListening = true;
		this.authedClient.realtime.onDisconnect = (activeSubscriptions) => {
			// Only a drop that had live subscriptions can have missed events; the SDK also reports this
			// while negotiating the very first connection, which has nothing to miss yet.
			if (activeSubscriptions.length === 0) return;
			for (const sync of this._syncs) sync.markStale();
		};
		// PB_CONNECT is the most precise "the backend is reachable again" signal available, but it
		// carries no correctness of its own: it only pokes stores that already know they missed
		// something, and a store that is not stale ignores it.
		void this.authedClient.realtime
			.subscribe('PB_CONNECT', () => {
				for (const sync of this._syncs) sync.retryNow();
			})
			.catch((error) => logError('pocketbase', 'reconnect_subscribe', error));
		if (!browser) return;
		window.addEventListener('online', this._retryTrigger);
		document.addEventListener('visibilitychange', this._retryTrigger);
	}

	unregisterRealtimeSync(sync: StaleSync) {
		this._syncs.delete(sync);
	}

	// Shared reachability gate for stale-store retries. An `online` event precedes real connectivity
	// and a slept laptop's socket lies about being open, so a retry round asks this first: one small
	// request answers for every store, instead of a dozen doomed refetches per tick. It is a gate the
	// retries await, not a latch - marking a store stale is idempotent and the flag outlives any
	// round, so a trigger landing mid-round is coalesced rather than dropped.
	probeBackend() {
		this._probe ??= this.authedClient.health
			.check({ requestKey: null })
			.then(
				() => true,
				() => false
			)
			.finally(() => {
				this._probe = null;
			});
		return this._probe;
	}

	get backendUrl(): string {
		return getBackendUrl();
	}

	async checkSetup(): Promise<SetupStatus> {
		try {
			const response = await fetch(`${this.backendUrl}/api/setup-status`);
			if (!response.ok) {
				this.setupStatus = 'unreachable';
			} else {
				const data = await response.json();
				this.setupStatus = data.ready ? 'ready' : 'needs-setup';
			}
		} catch {
			this.setupStatus = 'unreachable';
		}
		return this.setupStatus;
	}

	async findOrCreateLabel(name: string, ownerId: string) {
		const existing = await this.authedClient.collection('transactionLabels').getList(1, 1, {
			filter: `name = "${name}" && owner = "${ownerId}"`
		});

		if (existing.items.length > 0) {
			return existing.items[0].id;
		}

		const label = await this.authedClient.collection('transactionLabels').create({
			name,
			owner: ownerId
		});
		return label.id;
	}

	async postJson<T>(path: string, body: Record<string, unknown>) {
		const token = this.authedClient.authStore.token;
		const response = await fetch(`${this.backendUrl}${path}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify(body)
		});

		const data = (await response.json().catch(() => null)) as T | { message?: string } | null;
		if (!response.ok) {
			const message =
				data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
					? data.message
					: `Request failed with status ${response.status}`;
			throw new Error(message);
		}

		return data as T;
	}

	private captureError(error: unknown, context: string, operation: string) {
		logError(context, operation, error);
	}

	private isTransientError(error: unknown) {
		return error instanceof ClientResponseError && error.isAbort;
	}

	private isAuthError(error: unknown) {
		return error instanceof ClientResponseError && (error.status === 401 || error.status === 403);
	}

	private getErrorType(error: unknown, errorContext: 'connection' | 'subscription') {
		if (this.isTransientError(error)) {
			return { isAuth: false, isTransient: true } as const;
		}
		if (this.isAuthError(error)) {
			return { isAuth: true, isTransient: false, toastId: ToastId.AUTH_ERROR } as const;
		}
		const toastId =
			errorContext === 'subscription' ? ToastId.SUBSCRIPTION_ERROR : ToastId.CONNECTION_ERROR;
		return { isAuth: false, isTransient: false, toastId } as const;
	}

	handleConnectionError(error: unknown, context: string, operation: string) {
		const errorType = this.getErrorType(error, 'connection');
		if (errorType.isTransient) return;

		this.captureError(error, context, operation);
		const message = errorType.isAuth ? m.error_auth_failed() : m.error_connection_failed();
		toast.error(message, { id: errorType.toastId });
		if (errorType.isAuth) this.onAuthInvalidated?.();
	}

	handleSubscriptionError(error: unknown, context: string, operation: string) {
		const errorType = this.getErrorType(error, 'subscription');
		if (errorType.isTransient) return;

		this.captureError(error, context, operation);
		const message = errorType.isAuth ? m.error_auth_failed() : m.error_subscription_failed();
		toast.error(message, { id: errorType.toastId });
		if (errorType.isAuth) this.onAuthInvalidated?.();
	}
}

const CONTEXT_KEY = 'pocketbase-client';

export function setPocketBaseContext() {
	const store = new PocketBaseContext();
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getPocketBaseContext() {
	const store = getContext<PocketBaseContext>(CONTEXT_KEY);
	if (!store)
		throw new Error('PocketBase client context not found. Call setPocketBaseContext() first.');
	return store;
}
