import PocketBase from 'pocketbase';

import {
	AccountsBalanceGroupOptions,
	ExchangeRatesSourceOptions,
	type AccountBalancesRecord,
	type AccountsRecord,
	type AssetBalancesRecord,
	type AssetsRecord,
	type BalanceTypesRecord,
	type CurrenciesRecord,
	type ExchangeRatesRecord,
	type SecuritiesRecord,
	type SecurityBalancesRecord,
	type SecurityTransactionsRecord,
	type SecurityTransactionsTypeOptions,
	type TransactionLabelsRecord,
	type TransactionsRecord,
	type TypedPocketBase,
	type UsersRecord
} from '../src/lib/pocketbase.schema';

export const DEFAULT_PASSWORD = '123qweasdzxc';

export const PB_URL = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:42070';
const SUPERADMIN_EMAIL = 'superadmin@example.com';
const DEMO_EMAIL = 'demo@canutin.com';

async function getAdminPB() {
	const pb = new PocketBase(PB_URL) as TypedPocketBase;
	await pb.collection('_superusers').authWithPassword(SUPERADMIN_EMAIL, DEFAULT_PASSWORD);
	return pb;
}

export async function getUserPB(email: string) {
	const pb = new PocketBase(PB_URL) as TypedPocketBase;
	await pb.collection('users').authWithPassword(email, DEFAULT_PASSWORD);
	return pb;
}

export async function pbSend(path: string, body: Record<string, unknown>, email?: string) {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (email) {
		const pb = await getUserPB(email);
		headers['Authorization'] = `Bearer ${pb.authStore.token}`;
	}
	return fetch(`${PB_URL}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
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

// Triggers the server's `demoReset` cron so the shared demo account and its data exist.
// PocketBase v0.39 runs a registered cron on demand via `POST /api/crons/{id}` with
// superuser auth (apis/cron.go: `subGroup.POST("/{id}", cronRun)`). The handler is
// fire-and-forget and returns 204, so poll until the seeded account's data has committed.
export async function seedDemoAccount() {
	const pbAdmin = await getAdminPB();
	await pbAdmin.send('/api/crons/demoReset', { method: 'POST' });

	for (let attempt = 0; attempt < 60; attempt++) {
		const demoUser = await pbAdmin
			.collection('users')
			.getFirstListItem(`email='${DEMO_EMAIL}'`)
			.catch(() => null);
		if (demoUser) {
			const accounts = await pbAdmin
				.collection('accounts')
				.getList(1, 1, { filter: `owner='${demoUser.id}'` });
			if (accounts.totalItems > 0) return;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error('Demo account was not seeded after triggering demoReset');
}

export async function seedUser(name: string) {
	const pbAdmin = await getAdminPB();
	const uniqueId = Math.random().toString(36).slice(2, 10);
	const uniqueEmail = `${name}.${uniqueId}@example.com`;
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
	currency?: AccountsRecord['currency'];
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

export async function seedExchangeRate(exchangeRateInput: {
	currency: ExchangeRatesRecord['currency'];
	date: ExchangeRatesRecord['date'];
	owner: ExchangeRatesRecord['owner'];
	rate: ExchangeRatesRecord['rate'];
}) {
	const pb = await getAdminPB();
	return await pb.collection('exchangeRates').create({
		...exchangeRateInput,
		source: ExchangeRatesSourceOptions.manual
	});
}

export async function seedCurrency(currencyInput: {
	code: CurrenciesRecord['code'];
	name?: CurrenciesRecord['name'];
	autoUpdate?: CurrenciesRecord['autoUpdate'];
	owner: CurrenciesRecord['owner'];
}) {
	const pb = await getAdminPB();
	if (!currencyInput.autoUpdate) {
		return await pb.collection('currencies').create(currencyInput);
	}
	const currency = await pb
		.collection('currencies')
		.create({ ...currencyInput, autoUpdate: false });
	return await pb.collection('currencies').update(currency.id, { autoUpdate: true });
}

export async function seedAsset(assetInput: {
	name: AssetsRecord['name'];
	balanceGroup: AssetsRecord['balanceGroup'];
	balanceType: BalanceTypesRecord['name'];
	owner: UsersRecord['id'];
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
}) {
	const pb = await getAdminPB();
	return await pb.collection('assetBalances').create(assetBalanceInput);
}

export async function seedSecurity(securityInput: {
	name: SecuritiesRecord['name'];
	owner: SecuritiesRecord['owner'];
	symbol?: SecuritiesRecord['symbol'];
}) {
	const pb = await getAdminPB();
	return await pb.collection('securities').create(securityInput);
}

export async function seedSecurityBalance(securityBalanceInput: {
	account: SecurityBalancesRecord['account'];
	owner: SecurityBalancesRecord['owner'];
	security: SecurityBalancesRecord['security'];
	asOf: SecurityBalancesRecord['asOf'];
	quantity?: number | null;
	price?: number | null;
	value?: number | null;
	costBasis?: number | null;
}) {
	const pb = await getAdminPB();
	return await pb.collection('securityBalances').create(securityBalanceInput);
}

export async function seedTrade(tradeInput: {
	account: SecurityTransactionsRecord['account'];
	owner: SecurityTransactionsRecord['owner'];
	security: SecurityTransactionsRecord['security'];
	date: SecurityTransactionsRecord['date'];
	type: SecurityTransactionsTypeOptions;
	description?: SecurityTransactionsRecord['description'];
	quantity?: number | null;
	price?: number | null;
	amount?: number | null;
	fees?: number | null;
}) {
	const pb = await getAdminPB();
	return await pb.collection('securityTransactions').create(tradeInput);
}

// Seeds a set of brokerage accounts, securities, and the security balances that link
// them, resolving the balances' `account`/`security` references by name. Returns the
// created accounts and securities so callers can read ids for navigation.
export async function seedPortfolio(
	owner: UsersRecord['id'],
	spec: {
		accounts: string[];
		securities: { name: SecuritiesRecord['name']; symbol?: SecuritiesRecord['symbol'] }[];
		balances: {
			account: string;
			security: string;
			quantity?: number | null;
			price?: number | null;
			value?: number | null;
			costBasis?: number | null;
		}[];
		asOf?: string;
	}
) {
	const asOf = spec.asOf ?? new Date().toISOString();

	const accountsByName = new Map<string, AccountsRecord>();
	for (const name of spec.accounts) {
		accountsByName.set(
			name,
			await seedAccount({
				name,
				balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
				balanceType: 'Brokerage',
				owner
			})
		);
	}

	const securitiesByName = new Map<string, SecuritiesRecord>();
	for (const security of spec.securities) {
		securitiesByName.set(
			security.name,
			await seedSecurity({ name: security.name, symbol: security.symbol, owner })
		);
	}

	for (const balance of spec.balances) {
		const account = accountsByName.get(balance.account);
		const security = securitiesByName.get(balance.security);
		if (!account) {
			throw new Error(`seedPortfolio: balance references unknown account "${balance.account}"`);
		}
		if (!security) {
			throw new Error(`seedPortfolio: balance references unknown security "${balance.security}"`);
		}
		await seedSecurityBalance({
			account: account.id,
			security: security.id,
			owner,
			asOf,
			quantity: balance.quantity,
			price: balance.price,
			value: balance.value,
			costBasis: balance.costBasis
		});
	}

	return {
		accounts: [...accountsByName.values()],
		securities: [...securitiesByName.values()],
		asOf
	};
}

export async function updateAsset(id: string, updates: Partial<AssetsRecord>) {
	const pb = await getAdminPB();
	return await pb.collection('assets').update(id, updates);
}

export async function updateAccount(id: string, updates: Partial<AccountsRecord>) {
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

type SharePerspective = 'NORMAL' | 'INVERSE';
type ShareAccessRole = 'VIEWER';

export async function seedAccountShare(shareInput: {
	account: string;
	recipient: string;
	recipientEmail: string;
	grantedBy: string;
	accessRole: ShareAccessRole;
	perspective: SharePerspective;
	includeInNetWorth: boolean;
}) {
	const pb = await getAdminPB();
	return await pb.collection('accountShares').create(shareInput);
}

export async function seedAssetShare(shareInput: {
	asset: string;
	recipient: string;
	recipientEmail: string;
	grantedBy: string;
	accessRole: ShareAccessRole;
	perspective: SharePerspective;
	includeInNetWorth: boolean;
}) {
	const pb = await getAdminPB();
	return await pb.collection('assetShares').create(shareInput);
}

export async function recordExists(collection: string, id: string) {
	const pb = await getAdminPB();
	try {
		await pb.collection(collection).getOne(id);
		return true;
	} catch {
		return false;
	}
}

export async function deleteUser(id: string) {
	const pb = await getAdminPB();
	await pb.collection('users').delete(id);
}

export async function deleteAssetBalance(id: string) {
	const pb = await getAdminPB();
	await pb.collection('assetBalances').delete(id);
}

export async function getTransactionLabelsByName(owner: string, name: string) {
	const pb = await getAdminPB();
	return await pb.collection('transactionLabels').getFullList({
		filter: `owner = "${owner}" && name = "${name}"`
	});
}

export async function listAccountBalances(pb: TypedPocketBase, account: string) {
	return pb.collection('accountBalances').getFullList({
		filter: `account = "${account}"`,
		sort: '-asOf,-created,-id'
	});
}
