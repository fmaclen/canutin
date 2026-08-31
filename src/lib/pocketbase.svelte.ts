import PocketBase, { ClientResponseError } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';

import { logError } from './logger';
import { m } from './paraglide/messages';
import type { TypedPocketBase } from './pocketbase.schema';
import { getBackendUrl } from './utils';

export type SetupStatus = 'checking' | 'ready' | 'needs-setup' | 'unreachable';

// Waits between backend health probes during a recovery attempt. The list doubles as the attempt
// budget: after the last delay the attempt gives up and waits for the next trigger, so a user who
// stays offline for an hour is probed a handful of times, not continuously.
const RECOVERY_PROBE_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

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
	private _reconnectCallbacks = new Set<() => void>();
	private _reconnectListening = false;
	private _pendingReconnect = false;
	private _recovering = false;
	private _pendingRecovery = false;
	// Fires on the two browser signals that a dead connection may be usable again: the network
	// coming back, and the tab becoming visible after a sleep/wake or a backgrounded stretch. While
	// hidden the tab is left alone - the visibility signal picks it up when the user returns.
	private _recoveryTrigger = () => {
		if (document.visibilityState !== 'visible') return;
		void this.recoverRealtime();
	};

	constructor() {
		this.authedClient = new PocketBase(getBackendUrl());
	}

	// NOTE: the SDK resubmits subscriptions on realtime reconnect but never replays events emitted
	// while disconnected, so records shared to the user during that gap (e.g. a laptop wake or
	// network blip) stay invisible until a full re-init. Registered stores refetch on reconnect so a
	// session converges with what the backend allows without a logout/login.
	//
	// The SDK only reconnects when the EventSource reports a transport error, and EventSource has no
	// liveness detection: an offline network or a slept laptop routinely leaves the socket in an OPEN
	// state that never errors, so `onDisconnect` never fires and nothing would ever refetch. The
	// browser's `online` and `visibilitychange` signals are therefore part of the recovery contract,
	// not a nicety - they are the only trigger in the failing case.
	registerRealtimeReconnect(callback: () => void) {
		this._reconnectCallbacks.add(callback);
		if (this._reconnectListening) return;
		this._reconnectListening = true;
		this.authedClient.realtime.onDisconnect = (activeSubscriptions) => {
			this._pendingReconnect = activeSubscriptions.length > 0;
		};
		void this.authedClient.realtime
			.subscribe('PB_CONNECT', () => {
				if (!this._pendingReconnect) return;
				this._pendingReconnect = false;
				void this.recoverRealtime();
			})
			.catch((error) => logError('pocketbase', 'reconnect_subscribe', error));
		if (!browser) return;
		window.addEventListener('online', this._recoveryTrigger);
		document.addEventListener('visibilitychange', this._recoveryTrigger);
	}

	unregisterRealtimeReconnect(callback: () => void) {
		this._reconnectCallbacks.delete(callback);
	}

	// A refetch issued the instant a trigger fires can still hit a network that is not usable yet (an
	// `online` event precedes real connectivity, and a store refetch that fails is discarded), so
	// recovery is latched: it probes the backend on a bounded backoff and only invalidates the stores
	// once the backend actually answers. `_recovering` coalesces a burst of triggers - an SDK
	// reconnect, `online`, and `visibilitychange` typically arrive together - into a single refetch.
	// A trigger that lands while a round is already running is not dropped: the running round may
	// have read state from before whatever prompted the new trigger (a PB_CONNECT can arrive while a
	// visibility-triggered round is mid-flight), so it latches `_pendingRecovery` and a follow-up
	// round runs when the current one settles - the same follow-up rule stores apply to events that
	// arrive mid-fetch.
	private async recoverRealtime() {
		if (!this.authedClient.authStore.isValid) return;
		if (this._recovering) {
			this._pendingRecovery = true;
			return;
		}
		this._recovering = true;
		try {
			for (let attempt = 0; ; attempt++) {
				try {
					await this.authedClient.health.check({ requestKey: null });
					break;
				} catch (error) {
					if (attempt === RECOVERY_PROBE_DELAYS_MS.length) {
						logError('pocketbase', 'recovery_unreachable', error);
						return;
					}
					await new Promise((resolve) => setTimeout(resolve, RECOVERY_PROBE_DELAYS_MS[attempt]));
				}
			}
			for (const reconnect of this._reconnectCallbacks) {
				try {
					reconnect();
				} catch (error) {
					logError('pocketbase', 'reconnect_callback', error);
				}
			}
		} finally {
			this._recovering = false;
			if (this._pendingRecovery) {
				this._pendingRecovery = false;
				void this.recoverRealtime();
			}
		}
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
