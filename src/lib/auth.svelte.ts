import PocketBase, {
	BaseAuthStore,
	ClientResponseError,
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
	private _sessionVersion = 0;
	private _sessionRefresh: Promise<boolean> | null = null;

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

	async validateSession() {
		if (!this._pb.authStore.isValid) {
			this.teardownSession();
			return false;
		}
		if (this._sessionRefresh) return this._sessionRefresh;

		const version = this._sessionVersion;
		const token = this._pb.authStore.token;
		const userId = this._pb.authStore.record?.id;
		// The SDK saves refreshed credentials before resolving. Isolate that save so a response
		// arriving after logout cannot restore the shared session.
		const refreshClient = new PocketBase(this._pb.baseURL, new BaseAuthStore(), this._pb.lang);
		refreshClient.authStore.save(token, this._pb.authStore.record);
		const refresh = refreshClient
			.collection('users')
			.authRefresh()
			.then((session) => {
				if (version !== this._sessionVersion) return false;
				if (token !== this._pb.authStore.token) {
					return this._pb.authStore.isValid && this._pb.authStore.record?.id === userId;
				}
				this._pb.authStore.save(session.token, session.record);
				this.currentUser = this._pb.authStore;
				this.currentUserId = session.record.id;
				return true;
			})
			.catch((error) => {
				if (version !== this._sessionVersion) return false;
				if (token !== this._pb.authStore.token) {
					return this._pb.authStore.isValid && this._pb.authStore.record?.id === userId;
				}
				if (
					error instanceof ClientResponseError &&
					(error.status === 401 || error.status === 403)
				) {
					this.teardownSession();
					toast.error(m.error_auth_failed(), { id: 'auth-error' });
					return false;
				}
				logError('auth', 'refresh', error);
				if (!this._pb.authStore.isValid) {
					this.teardownSession();
					return false;
				}
				return true;
			})
			.finally(() => {
				if (this._sessionRefresh === refresh) this._sessionRefresh = null;
			});
		this._sessionRefresh = refresh;
		return refresh;
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

		return this._pb
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
		this._sessionVersion++;
		this._sessionRefresh = null;
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

	private getErrorMessage(err: unknown, fallback: string) {
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
		this._sessionVersion++;
		this._sessionRefresh = null;
		this.error = null;
		this.isSubmitting = true;
		try {
			await this._pb.collection('users').authWithPassword(email, password);
			this.currentUser = this._pb.authStore;
			this.currentUserId = this._pb.authStore.record?.id ?? '';
			this.subscribeToCurrentUser();
			return { success: true } as const;
		} catch (e: unknown) {
			// PocketBase answers rejected credentials with a 400 here. Any other status keeps its
			// own message so an outage isn't mislabelled as a bad password.
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
			// Sign-ups closed means no create rule on `users`, which PocketBase forbids with a 403.
			// A rejected payload comes back as a 400 and keeps its own field-level message.
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
		this._sessionVersion++;
		this._sessionRefresh = null;
		this.error = null;
		try {
			this.runRealtimeTeardowns();
			// The SDK batches every unsubscribe above into one realtime request sent on a later
			// microtask, and it attaches whatever token the auth store holds at that moment. The server
			// rejects a subscription change whose auth differs from the connection's, so the token must
			// outlive that request.
			await this.unsubscribeFromCurrentUser();
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
