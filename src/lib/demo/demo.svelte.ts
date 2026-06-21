import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

import { env } from '$env/dynamic/public';
import type { AuthContext } from '$lib/auth.svelte';
import { logError } from '$lib/logger';
import { m } from '$lib/paraglide/messages.js';
import type { TypedPocketBase } from '$lib/pocketbase.schema';

import { generateDemoEmail } from './email-generator';
import { seedDemoData } from './seed';

const STORAGE_KEY = 'canutin-demo-seeded';
const DEMO_PASSWORD = '123qweasdzxc';
const TOAST_ID = 'demo-seeding';

export class DemoContext {
	isSeeding = $state(false);
	isStarting = $state(false);
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

	async startDemo() {
		if (!this.isEnabled) {
			logError('demo', 'start', 'Demo mode is not enabled');
			return { success: false };
		}

		if (this.isStarting || this.isSeeding) {
			return { success: true };
		}

		this.isStarting = true;

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
					logError('demo', 'start', 'Failed to login after user creation');
					toast.error(m.demo_seeding_failed());
					return { success: false };
				}

				// Allow auth state to settle before seeding
				await new Promise((resolve) => setTimeout(resolve, 500));

				userId = this._auth.currentUser?.record?.id;
			}

			if (!userId) {
				logError('demo', 'start', 'No user ID after authentication');
				toast.error(m.demo_seeding_failed());
				return { success: false };
			}

			if (this.isAlreadySeeded(userId) || this.isSeeding) {
				return { success: true };
			}

			await this.seed(userId);
			return { success: true };
		} catch (error) {
			logError('demo', 'start', error);
			toast.error(m.demo_seeding_failed());
			return { success: false };
		} finally {
			this.isStarting = false;
		}
	}

	private async seed(userId: string) {
		this.isSeeding = true;
		toast.loading(m.demo_seeding_in_progress(), { id: TOAST_ID, duration: Infinity });

		try {
			await seedDemoData(this._pb, userId);
			this.markAsSeeded(userId);
			toast.success(m.demo_seeding_complete(), { id: TOAST_ID });
		} catch (error) {
			logError('demo', 'seed', error);
			toast.error(m.demo_seeding_failed(), { id: TOAST_ID });
			throw error;
		} finally {
			this.isSeeding = false;
		}
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
