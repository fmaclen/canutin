import PocketBase, { type BaseAuthStore, type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

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
			this._pb.authStore.clear();
			this.currentUser = null;
			return false;
		}
	}

	private subscribeToCurrentUser() {
		const userId = this._pb.authStore.record?.id;
		if (!userId) return;

		this._pb
			.collection('users')
			.subscribe(userId, this.onCurrentUserEvent.bind(this))
			.catch((error) => console.error('[auth:subscribe]', error));
	}

	private onCurrentUserEvent(e: RecordSubscription<UsersResponse>) {
		if (e.action === 'delete') {
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
		this.error = null;
		this.isLoading = true;
		try {
			await this._pb.collection('users').authWithPassword(email, password);
			this.currentUser = this._pb.authStore;
			return { success: true } as const;
		} catch (e: unknown) {
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
		this.error = null;
		try {
			this._pb.authStore.clear();
		} finally {
			this.currentUser = null;
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
