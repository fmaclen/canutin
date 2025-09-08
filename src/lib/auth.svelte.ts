import PocketBase, { BaseAuthStore } from 'pocketbase';
import { getContext, setContext } from 'svelte';

export class AuthContext {
	currentUser: BaseAuthStore | null = $state(null);
	auth: { token: string; record: any } | null = $state(null);
	isLoading: boolean = $state(false);
	error: string | null = $state(null);

	private _pb: PocketBase;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.currentUser = pb.authStore;
		this.auth = pb.authStore.record ? { token: pb.authStore.token, record: pb.authStore.record } : null;
		pb.authStore.onChange((token, record) => {
			this.auth = record ? { token, record } : null;
		});
		this.isLoading = false;
	}

	async login(email: string, password: string) {
		this.error = null;
		this.isLoading = true;
		try {
			await this._pb.collection('users').authWithPassword(email, password);
			this.currentUser = this._pb.authStore;
			this.auth = this._pb.authStore.record
				? { token: this._pb.authStore.token, record: this._pb.authStore.record }
				: null;
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
			this.auth = this._pb.authStore.record
				? { token: this._pb.authStore.token, record: this._pb.authStore.record }
				: null;
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
			this.auth = null;
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
