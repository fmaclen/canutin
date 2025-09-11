import PocketBase from 'pocketbase';

import type { TypedPocketBase } from '../src/lib/pocketbase.schema';

export const DEFAULT_PASSWORD = '123qweasdzxc';
const PB_URL = 'http://127.0.0.1:42070';
const SUPERADMIN_EMAIL = 'superadmin@example.com';

const pb = new PocketBase(PB_URL) as TypedPocketBase;

export async function adminLogin(): Promise<void> {
	await pb.collection('_superusers').authWithPassword(SUPERADMIN_EMAIL, DEFAULT_PASSWORD);
}

export const resetDatabase = async () => {
	const collections = await pb.collections.getFullList();
	const targets = collections.filter((c) => c.type !== 'view' && c.name !== '_superusers');
	for (const c of targets) {
		await pb.collections.truncate(c.name);
	}
};

export const seedUser = async (email: string) => {
	// alice@example.com -> alice+1720699914562@example.com
	const [name, domain] = email.split('@');
	const uniqueEmail = `${name}+${Date.now()}@${domain}`;
	return await pb
		.collection('users')
		.create({ email: uniqueEmail, password: DEFAULT_PASSWORD, passwordConfirm: DEFAULT_PASSWORD });
};

export const seedAccount = async () => {};
export const seedAccountBalance = async () => {};
export const seedAsset = async () => {};
export const seedAssetBalance = async () => {};
export const seedTransaction = async () => {};
