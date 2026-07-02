import PocketBase, { ClientResponseError } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { logError } from './logger';
import { m } from './paraglide/messages';
import type { TypedPocketBase } from './pocketbase.schema';
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

	constructor() {
		this.authedClient = new PocketBase(getBackendUrl());
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
