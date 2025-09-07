import PocketBase, { type RecordAuthResponse, type RecordModel } from 'pocketbase';
import { getContext, setContext } from 'svelte';

export class AuthContext {
	session: RecordAuthResponse<RecordModel> | null = $state(null);
	isLoading: boolean = $state(false);
	error: string | null = $state(null);

	private _pb: PocketBase | null = null;

	constructor(pb: PocketBase) {
		this._pb = pb;
	}

	get isAuthenticated() {
		return !!this.session;
	}

	async login(email: string, password: string) {}

	async signup(email: string, password: string) {}

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
