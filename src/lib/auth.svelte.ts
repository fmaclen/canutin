import PocketBase, { type BaseAuthStore, type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { m } from '$lib/paraglide/messages.js';
import type { UsersResponse } from '$lib/pocketbase.schema';

export class AuthContext {
	currentUser: BaseAuthStore | null = $state(null);
	isLoading: boolean = $state(true);
	error: string | null = $state(null);

	private _pb: PocketBase;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.currentUser = this._pb.authStore;
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
			this.currentUser = this._pb.authStore;
			return true;
		} catch {
			this.unsubscribeFromCurrentUser();
			this._pb.authStore.clear();
			this.currentUser = null;
			toast.error(m.error_auth_failed(), { id: 'auth-error' });
			return false;
		}
	}

	private subscribeToCurrentUser() {
		const userId = this._pb.authStore.record?.id;
		console.log('[auth] subscribeToCurrentUser called, userId:', userId);
		if (!userId) return;

		this._pb
			.collection('users')
			.subscribe(userId, this.onCurrentUserEvent.bind(this))
			.then(() => console.log('[auth] subscribeToCurrentUser SUCCESS'))
			.catch((error) => console.error('[auth:subscribe]', error));
	}

	private unsubscribeFromCurrentUser() {
		const userId = this._pb.authStore.record?.id;
		console.log('[auth] unsubscribeFromCurrentUser called, userId:', userId);
		if (!userId) return;

		this._pb
			.collection('users')
			.unsubscribe(userId)
			.then(() => console.log('[auth] unsubscribeFromCurrentUser SUCCESS'))
			.catch((error) => console.error('[auth:unsubscribe]', error));
	}

	private onCurrentUserEvent(e: RecordSubscription<UsersResponse>) {
		if (e.action === 'delete') {
			this.unsubscribeFromCurrentUser();
			this._pb.authStore.clear();
			this.currentUser = null;
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
		console.log('[auth] login called for:', email);
		this.error = null;
		this.isLoading = true;
		try {
			console.log('[auth] calling authWithPassword...');
			await this._pb.collection('users').authWithPassword(email, password);
			console.log(
				'[auth] authWithPassword complete, authStore.isValid:',
				this._pb.authStore.isValid
			);
			this.currentUser = this._pb.authStore;
			console.log('[auth] calling subscribeToCurrentUser (fire-and-forget)...');
			this.subscribeToCurrentUser();
			console.log('[auth] login returning success');
			return { success: true } as const;
		} catch (e: unknown) {
			console.error('[auth] login failed:', e);
			this.error = this.getErrorMessage(e, m.auth_login_failed());
			return { success: false, error: this.error } as const;
		} finally {
			this.isLoading = false;
		}
	}

	async signup(email: string, password: string, passwordConfirm: string) {
		this.error = null;
		this.isLoading = true;
		try {
			await this._pb.collection('users').create({ email, password, passwordConfirm });
			this.currentUser = this._pb.authStore;
			return { success: true } as const;
		} catch (e: unknown) {
			this.error = this.getErrorMessage(e, m.auth_signup_failed());
			return { success: false, error: this.error } as const;
		} finally {
			this.isLoading = false;
		}
	}

	async logout() {
		console.log('[auth] logout called');
		this.error = null;
		try {
			this.unsubscribeFromCurrentUser();
			console.log('[auth] clearing authStore...');
			this._pb.authStore.clear();
			console.log('[auth] authStore cleared');
		} finally {
			this.currentUser = null;
			console.log('[auth] logout complete');
		}
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
