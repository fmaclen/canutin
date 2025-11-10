import PocketBase, { ClientResponseError } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { env } from '$env/dynamic/public';

import { m } from './paraglide/messages';
import type { TypedPocketBase } from './pocketbase.schema';

enum ToastId {
	CONNECTION_ERROR = 'connection-error',
	SUBSCRIPTION_ERROR = 'subscription-error',
	AUTH_ERROR = 'auth-error'
}

export class PocketBaseContext {
	authedClient: TypedPocketBase;

	constructor() {
		this.authedClient = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');
	}

	private captureError(error: unknown, context: string, operation: string) {
		console.error(`[${context}:${operation}]`, error);
	}

	private isAuthError(error: unknown) {
		return error instanceof ClientResponseError && (error.status === 401 || error.status === 403);
	}

	private getErrorType(error: unknown, errorContext: 'connection' | 'subscription') {
		if (this.isAuthError(error)) {
			return { isAuth: true, toastId: ToastId.AUTH_ERROR };
		}
		const toastId =
			errorContext === 'subscription' ? ToastId.SUBSCRIPTION_ERROR : ToastId.CONNECTION_ERROR;
		return { isAuth: false, toastId };
	}

	handleConnectionError(error: unknown, context: string, operation: string) {
		this.captureError(error, context, operation);
		const errorType = this.getErrorType(error, 'connection');
		const message = errorType.isAuth ? m.error_auth_failed() : m.error_connection_failed();
		toast.error(message, { id: errorType.toastId });

		if (errorType.isAuth) {
			this.authedClient.authStore.clear();
		}
	}

	handleSubscriptionError(error: unknown, context: string, operation: string) {
		this.captureError(error, context, operation);
		const errorType = this.getErrorType(error, 'subscription');
		const message = errorType.isAuth ? m.error_auth_failed() : m.error_subscription_failed();
		toast.error(message, { id: errorType.toastId });

		if (errorType.isAuth) {
			this.authedClient.authStore.clear();
		}
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
