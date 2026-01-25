import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { env } from '$env/dynamic/public';
import type { AuthContext } from '$lib/auth.svelte';
import { m } from '$lib/paraglide/messages.js';
import type { TypedPocketBase } from '$lib/pocketbase.schema';

import { generateDemoEmail } from './email-generator';
import { seedDemoData } from './seed';

const STORAGE_KEY = 'demo-seeded';
const DEMO_PASSWORD = '123qweasdzxc';
const TOAST_ID = 'demo-seeding';

export class DemoContext {
	isSeeding = $state(false);
	isEnabled = $state(false);

	private _pb: TypedPocketBase;
	private _auth: AuthContext;

	constructor(pb: TypedPocketBase, auth: AuthContext) {
		this._pb = pb;
		this._auth = auth;
		this.isEnabled = env.PUBLIC_DEMO_ENABLED === 'true';
	}

	private getStorageKey(userId: string) {
		return `${STORAGE_KEY}-${userId}`;
	}

	private isAlreadySeeded(userId: string) {
		if (typeof localStorage === 'undefined') return false;
		return localStorage.getItem(this.getStorageKey(userId)) === 'true';
	}

	private markAsSeeded(userId: string) {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(this.getStorageKey(userId), 'true');
	}

	async startDemo(): Promise<{ success: boolean }> {
		if (!this.isEnabled) {
			console.error('[demo] Demo mode is not enabled');
			return { success: false };
		}

		if (this.isSeeding) {
			return { success: true };
		}

		try {
			let userId = this._auth.currentUser?.record?.id;

			if (!userId) {
				const email = generateDemoEmail();
				await this._pb.collection('users').create({
					email,
					password: DEMO_PASSWORD,
					passwordConfirm: DEMO_PASSWORD
				});

				const loginResult = await this._auth.login(email, DEMO_PASSWORD);
				if (!loginResult.success) {
					console.error('[demo] Failed to login after user creation');
					return { success: false };
				}

				userId = this._auth.currentUser?.record?.id;
			}

			if (!userId) {
				console.error('[demo] No user ID after authentication');
				return { success: false };
			}

			if (this.isAlreadySeeded(userId)) {
				return { success: true };
			}

			this.seedInBackground(userId);
			return { success: true };
		} catch (error) {
			console.error('[demo] Failed to start demo:', error);
			return { success: false };
		}
	}

	private seedInBackground(userId: string) {
		this.isSeeding = true;
		this.markAsSeeded(userId);
		toast.loading(m.demo_seeding_in_progress(), { id: TOAST_ID, duration: Infinity });

		seedDemoData(this._pb, userId)
			.then(() => {
				this.isSeeding = false;
				toast.success(m.demo_seeding_complete(), { id: TOAST_ID });
			})
			.catch((error) => {
				console.error('[demo:seed]', error);
				this.isSeeding = false;
				toast.error(m.demo_seeding_failed(), { id: TOAST_ID });
			});
	}
}

const CONTEXT_KEY = 'demo';

export function setDemoContext(pb: TypedPocketBase, auth: AuthContext) {
	const store = new DemoContext(pb, auth);
	setContext(CONTEXT_KEY, store);
	return store;
}

export function getDemoContext() {
	const store = getContext<DemoContext>(CONTEXT_KEY);
	if (!store) throw new Error('Demo context not found. Call setDemoContext() first.');
	return store;
}
