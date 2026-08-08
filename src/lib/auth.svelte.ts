import PocketBase, {
	ClientResponseError,
	type BaseAuthStore,
	type RecordSubscription
} from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { SvelteSet } from 'svelte/reactivity';

import { logError } from '$lib/logger';
import { m } from '$lib/paraglide/messages.js';
import type { UsersResponse } from '$lib/pocketbase.schema';

export class AuthContext {
	currentUser: BaseAuthStore | null = $state(null);
	currentUserId: string = $state('');
	isLoading: boolean = $state(true);
	isSubmitting: boolean = $state(false);
	error: string | null = $state(null);

	private _pb: PocketBase;
	private _realtimeTeardowns = new SvelteSet<() => void>();

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.currentUser = this._pb.authStore;
		this.currentUserId = this._pb.authStore.record?.id ?? '';
		this.init();
	}

	private async init() {
		const isValid = await this.validateSession();
		if (isValid) {
			this.subscribeToCurrentUser();
		}
		this.isLoading = false;
	}

	private async validateSession() {
		if (!this._pb.authStore.isValid) {
			return false;
		}

		try {
			await this._pb.collection('users').authRefresh();
		} catch (error) {
			if (error instanceof ClientResponseError && (error.status === 401 || error.status === 403)) {
				this.teardownSession();
				toast.error(m.error_auth_failed(), { id: 'auth-error' });
				return false;
			}
		}
		this.currentUser = this._pb.authStore;
		this.currentUserId = this._pb.authStore.record?.id ?? '';
		return true;
	}

	private subscribeToCurrentUser() {
		const userId = this._pb.authStore.record?.id;
		if (!userId) return;

		this._pb
			.collection('users')
			.subscribe(userId, this.onCurrentUserEvent.bind(this))
			.catch((error) => logError('auth', 'subscribe', error));
	}

	private unsubscribeFromCurrentUser() {
		const userId = this._pb.authStore.record?.id;
		if (!userId) return;

		this._pb
			.collection('users')
			.unsubscribe(userId)
			.catch((error) => logError('auth', 'unsubscribe', error));
	}

	private runRealtimeTeardowns() {
		for (const teardown of this._realtimeTeardowns) {
			try {
				teardown();
			} catch (error) {
				logError('auth', 'teardown', error);
			}
		}
	}

	registerRealtimeTeardown(teardown: () => void) {
		this._realtimeTeardowns.add(teardown);
	}

	unregisterRealtimeTeardown(teardown: () => void) {
		this._realtimeTeardowns.delete(teardown);
	}

	private teardownSession() {
		this.runRealtimeTeardowns();
		this.unsubscribeFromCurrentUser();
		this._pb.authStore.clear();
		this.currentUser = null;
		this.currentUserId = '';
	}

	private onCurrentUserEvent(e: RecordSubscription<UsersResponse>) {
		if (e.action === 'delete') {
			this.teardownSession();
		}
	}

	private getErrorMessage(err: unknown, fallback: string): string {
		if (typeof err === 'string') return err;
		if (err && typeof err === 'object') {
			const maybe = err as { message?: unknown; response?: { message?: unknown } };
			if (maybe.response && typeof maybe.response.message === 'string')
				return maybe.response.message;
			if (typeof maybe.message === 'string') return maybe.message;
		}
		return fallback;
	}

	async login(email: string, password: string) {
		this.error = null;
		this.isSubmitting = true;
		try {
			await this._pb.collection('users').authWithPassword(email, password);
			this.currentUser = this._pb.authStore;
			this.currentUserId = this._pb.authStore.record?.id ?? '';
			this.subscribeToCurrentUser();
			return { success: true } as const;
		} catch (e: unknown) {
			// PocketBase answers rejected credentials with a 400 on the auth endpoint. Every
			// other status (outage, rate limit, misconfiguration) keeps its own message so a
			// server-side failure isn't mislabelled as a bad password.
			this.error =
				e instanceof ClientResponseError && e.status === 400
					? m.auth_login_invalid_credentials()
					: this.getErrorMessage(e, m.auth_login_failed());
			return { success: false, error: this.error } as const;
		} finally {
			this.isSubmitting = false;
		}
	}

	async signup(email: string, password: string, passwordConfirm: string) {
		this.error = null;
		this.isSubmitting = true;
		try {
			await this._pb.collection('users').create({ email, password, passwordConfirm });
			this.currentUser = this._pb.authStore;
			this.currentUserId = this._pb.authStore.record?.id ?? '';
			return { success: true } as const;
		} catch (e: unknown) {
			// A server with sign-ups closed has no create rule on `users`, so PocketBase
			// forbids the anonymous create with a 403. A rejected payload (mismatched
			// password confirmation, duplicate email) comes back as a 400 and keeps its own
			// field-level message.
			this.error =
				e instanceof ClientResponseError && e.status === 403
					? m.auth_signup_closed()
					: this.getErrorMessage(e, m.auth_signup_failed());
			return { success: false, error: this.error } as const;
		} finally {
			this.isSubmitting = false;
		}
	}

	async logout() {
		this.error = null;
		try {
			this.runRealtimeTeardowns();
			this.unsubscribeFromCurrentUser();
			this._pb.authStore.clear();
		} finally {
			this.currentUser = null;
			this.currentUserId = '';
		}
	}

	invalidateSession() {
		this.teardownSession();
	}
}

const CONTEXT_KEY = 'auth-store';

export function setAuthContext(pb: PocketBase) {
	const store = new AuthContext(pb);
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getAuthContext() {
	const store = getContext<AuthContext>(CONTEXT_KEY);
	if (!store) throw new Error('Auth context not found. Call setAuthContext() first.');
	return store;
}
