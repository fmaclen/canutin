import PocketBase from 'pocketbase';

import type {
	AccountBalancesRecord,
	AccountsRecord,
	BalanceTypesRecord,
	TypedPocketBase,
	UsersRecord
} from '../src/lib/pocketbase.schema';

export const DEFAULT_PASSWORD = '123qweasdzxc';
const PB_URL = 'http://127.0.0.1:42070';
const SUPERADMIN_EMAIL = 'superadmin@example.com';

const pb = new PocketBase(PB_URL) as TypedPocketBase;

export async function adminLogin(): Promise<void> {
	await pb.collection('_superusers').authWithPassword(SUPERADMIN_EMAIL, DEFAULT_PASSWORD);
}

export async function resetDatabase() {
	const collections = await pb.collections.getFullList();
	const targets = collections.filter((c) => c.type !== 'view' && c.name !== '_superusers');
	for (const c of targets) {
		await pb.collections.truncate(c.name);
	}
}

export async function seedUser(name: string) {
	const uniqueEmail = `${name}.${Date.now()}@example.com`;
	return await pb.collection('users').create({
		email: uniqueEmail,
		password: DEFAULT_PASSWORD,
		passwordConfirm: DEFAULT_PASSWORD,
		emailVisibility: true
	});
}

async function getOrCreateBalanceType(name: BalanceTypesRecord['name'], owner: UsersRecord['id']) {
	let balanceType: BalanceTypesRecord | null;
	try {
		balanceType = await pb
			.collection('balanceTypes')
			.getFirstListItem(`name='${name}' && owner='${owner}'`);
	} catch {
		balanceType = null;
	}
	if (balanceType) return balanceType;
	return await pb.collection('balanceTypes').create({ name, owner });
}

export async function seedAccount(accountInput: {
	name: AccountsRecord['name'];
	balanceGroup: AccountsRecord['balanceGroup'];
	institution?: AccountsRecord['institution'];
	balanceType: BalanceTypesRecord['name'];
	owner: UsersRecord['id'];
	closed?: AccountsRecord['closed'];
	autoCalculated?: AccountsRecord['autoCalculated'];
	excluded?: AccountsRecord['excluded'];
}) {
	const balanceType = await getOrCreateBalanceType(accountInput.balanceType, accountInput.owner);
	accountInput.balanceType = balanceType.id;
	return await pb.collection('accounts').create(accountInput);
}

export async function seedAccountBalance(accountBalanceInput: {
	account: AccountBalancesRecord['account'];
	owner: AccountBalancesRecord['owner'];
	asOf: AccountBalancesRecord['asOf'];
	value?: AccountBalancesRecord['value'];
}) {
	return await pb.collection('accountBalances').create(accountBalanceInput);
}
export async function seedAsset() {}
export async function seedAssetBalance() {}
export async function seedTransaction() {}
