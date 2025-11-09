import PocketBase from 'pocketbase';

import type {
	AccountBalancesRecord,
	AccountsRecord,
	AssetBalancesRecord,
	AssetsRecord,
	BalanceTypesRecord,
	TransactionLabelsRecord,
	TransactionsRecord,
	TypedPocketBase,
	UsersRecord
} from '../src/lib/pocketbase.schema';

export const DEFAULT_PASSWORD = '123qweasdzxc';

const PB_URL = 'http://127.0.0.1:42070';
const SUPERADMIN_EMAIL = 'superadmin@example.com';

async function getAdminPB(): Promise<TypedPocketBase> {
	const pb = new PocketBase(PB_URL) as TypedPocketBase;
	await pb.collection('_superusers').authWithPassword(SUPERADMIN_EMAIL, DEFAULT_PASSWORD);
	return pb;
}

export async function resetDatabase() {
	const pbAdmin = await getAdminPB();
	try {
		// Deleting the users collection will cascade delete all other collections
		await pbAdmin.collections.truncate('users');
	} catch {
		// HACK: PB may 400 during cascade but deletions still apply; ignore.
	}
}

export async function seedUser(name: string) {
	const pbAdmin = await getAdminPB();
	const uniqueEmail = `${name}.${Date.now()}@example.com`;
	return await pbAdmin.collection('users').create({
		email: uniqueEmail,
		password: DEFAULT_PASSWORD,
		passwordConfirm: DEFAULT_PASSWORD,
		emailVisibility: true
	});
}

async function getOrCreateBalanceType(
	pbAdmin: TypedPocketBase,
	name: BalanceTypesRecord['name'],
	owner: UsersRecord['id']
) {
	let balanceType: BalanceTypesRecord | null;
	try {
		balanceType = await pbAdmin
			.collection('balanceTypes')
			.getFirstListItem(`name='${name}' && owner='${owner}'`);
	} catch {
		balanceType = null;
	}
	if (balanceType) return balanceType;
	return await pbAdmin.collection('balanceTypes').create({ name, owner });
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
	const pbAdmin = await getAdminPB();
	const balanceType = await getOrCreateBalanceType(
		pbAdmin,
		accountInput.balanceType,
		accountInput.owner
	);
	accountInput.balanceType = balanceType.id;
	return await pbAdmin.collection('accounts').create(accountInput);
}

export async function seedAccountBalance(accountBalanceInput: {
	account: AccountBalancesRecord['account'];
	owner: AccountBalancesRecord['owner'];
	asOf: AccountBalancesRecord['asOf'];
	value?: AccountBalancesRecord['value'];
}) {
	const pb = await getAdminPB();
	return await pb.collection('accountBalances').create(accountBalanceInput);
}

export async function seedAsset(assetInput: {
	name: AssetsRecord['name'];
	balanceGroup: AssetsRecord['balanceGroup'];
	balanceType: BalanceTypesRecord['name'];
	owner: UsersRecord['id'];
	type?: AssetsRecord['type'];
	symbol?: AssetsRecord['symbol'];
	sold?: AssetsRecord['sold'];
	excluded?: AssetsRecord['excluded'];
}) {
	const pbAdmin = await getAdminPB();
	const balanceType = await getOrCreateBalanceType(
		pbAdmin,
		assetInput.balanceType,
		assetInput.owner
	);
	assetInput.balanceType = balanceType.id;
	return await pbAdmin.collection('assets').create(assetInput);
}

export async function seedAssetBalance(assetBalanceInput: {
	asset: AssetBalancesRecord['asset'];
	owner: AssetBalancesRecord['owner'];
	asOf: AssetBalancesRecord['asOf'];
	bookValue?: AssetBalancesRecord['bookValue'];
	marketValue?: AssetBalancesRecord['marketValue'];
	bookPrice?: AssetBalancesRecord['bookPrice'];
	marketPrice?: AssetBalancesRecord['marketPrice'];
	quantity?: AssetBalancesRecord['quantity'];
}) {
	const pb = await getAdminPB();
	return await pb.collection('assetBalances').create(assetBalanceInput);
}

export async function updateAsset(
	id: string,
	updates: Partial<AssetsRecord>
): Promise<AssetsRecord> {
	const pb = await getAdminPB();
	return await pb.collection('assets').update(id, updates);
}

export async function updateAccount(
	id: string,
	updates: Partial<AccountsRecord>
): Promise<AccountsRecord> {
	const pb = await getAdminPB();
	return await pb.collection('accounts').update(id, updates);
}

export async function seedTransactionLabel(labelInput: {
	name: TransactionLabelsRecord['name'];
	owner: TransactionLabelsRecord['owner'];
}) {
	const pb = await getAdminPB();
	return await pb.collection('transactionLabels').create(labelInput);
}

export async function seedTransaction(transactionInput: {
	account: TransactionsRecord['account'];
	owner: TransactionsRecord['owner'];
	date: TransactionsRecord['date'];
	description: TransactionsRecord['description'];
	value: TransactionsRecord['value'];
	excluded?: TransactionsRecord['excluded'];
	labels?: TransactionsRecord['labels'];
}) {
	const pb = await getAdminPB();
	return await pb.collection('transactions').create(transactionInput);
}
