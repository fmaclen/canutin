import PocketBase, { type RecordAuthResponse, type RecordModel } from 'pocketbase';
import { getContext, setContext } from 'svelte';

export class AuthContext {
	authStore: RecordAuthResponse<RecordModel> | null = $state(null); // FIXME: migrate to PocketBase authStore shape if needed
	isLoading: boolean = $state(false);
	error: string | null = $state(null);

	private _pb: PocketBase | null = null;

	constructor(pb: PocketBase) {
		this._pb = pb;
	}

	get isAuthenticated() {
		return !!this.authStore; // FIXME: consider using this._pb?.authStore.isValid
	}

	async login(email: string, password: string) {}

	async signup(email: string, password: string, passwordConfirm: string) {
		this.error = null;
		this.isLoading = true;
		try {
			await this._pb!.collection('users').create({ email, password, passwordConfirm }); // FIXME: configurable collection name
			const auth = await this._pb!.collection('users').authWithPassword(email, password); // FIXME: configurable collection name
			this.authStore = auth;
			return { success: true } as const;
		} catch (e: any) {
			const message = e?.response?.message || e?.message || 'Sign up failed'; // FIXME: localize errors
			this.error = message;
			return { success: false, error: message } as const;
		} finally {
			this.isLoading = false;
		}
	}

	async logout() {}
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
