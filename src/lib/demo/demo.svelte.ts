import { getContext, setContext } from 'svelte';

import { env } from '$env/dynamic/public';
import type { AuthContext } from '$lib/auth.svelte';
import { logError } from '$lib/logger';

const DEMO_EMAIL = 'demo@canutin.com';
const DEMO_PASSWORD = '123qweasdzxc';

export class DemoContext {
	isStarting = $state(false);
	isEnabled = $state(false);

	private _auth: AuthContext;

	constructor(auth: AuthContext) {
		this._auth = auth;
		this.isEnabled = env.PUBLIC_DEMO_ENABLED === 'true';
	}

	async startDemo() {
		if (!this.isEnabled) {
			logError('demo', 'start', 'Demo mode is not enabled');
			return { success: false };
		}

		if (this._auth.currentUserId) {
			return { success: true };
		}

		if (this.isStarting) {
			return { success: true };
		}

		this.isStarting = true;

		try {
			const result = await this._auth.login(DEMO_EMAIL, DEMO_PASSWORD);
			if (!result.success) {
				logError('demo', 'start', 'Failed to login to the demo account');
			}
			return { success: result.success };
		} catch (error) {
			logError('demo', 'start', error);
			return { success: false };
		} finally {
			this.isStarting = false;
		}
	}
}

const CONTEXT_KEY = 'demo';

export function setDemoContext(auth: AuthContext) {
	const store = new DemoContext(auth);
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getDemoContext() {
	const store = getContext<DemoContext>(CONTEXT_KEY);
	if (!store) throw new Error('Demo context not found. Call setDemoContext() first.');
	return store;
}
