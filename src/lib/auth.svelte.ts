import PocketBase, { BaseAuthStore } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { env } from '$env/dynamic/public';

export class AuthContext {
	currentUser: BaseAuthStore | null = $state(null);
	isLoading: boolean = $state(true);
	error: string | null = $state(null);

	private _pb: PocketBase;

	constructor() {
		this._pb = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');
		this.currentUser = this._pb.authStore;
		this.isLoading = false;
	}

	async login(email: string, password: string) {
		this.error = null;
		this.isLoading = true;
		try {
			await this._pb.collection('users').authWithPassword(email, password);
			this.currentUser = this._pb.authStore;
			return { success: true } as const;
		} catch (e: any) {
			const message = e?.response?.message || e?.message || 'Login failed';
			this.error = message;
			return { success: false, error: message } as const;
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
			console.warn("signup this.currentUser", this.currentUser);
			console.warn("signup this.currentUser.record", this.currentUser.record);
			console.warn("signup this.currentUser.record.isValid", this.currentUser.isValid);
			return { success: true } as const;
		} catch (e: any) {
			const message = e?.response?.message || e?.message || 'Sign up failed';
			this.error = message;
			return { success: false, error: message } as const;
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

export function setAuthContext() {
	const store = new AuthContext();
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getAuthContext() {
	const store = getContext<AuthContext>(CONTEXT_KEY);
	if (!store) throw new Error('Auth context not found. Call setAuthContext() first.');
	return store;
}
