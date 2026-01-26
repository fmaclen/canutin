import type { TypedPocketBase } from '$lib/pocketbase.schema';

import {
	ACCOUNT_401K,
	ACCOUNT_AUTO_LOAN,
	ACCOUNT_CHECKING,
	ACCOUNT_CREDIT_CARD,
	ACCOUNT_ROTH_IRA,
	ACCOUNT_SAVINGS,
	ACCOUNT_WALLET,
	ALL_ACCOUNTS,
	type AccountDefinition
} from './seed-data/accounts';
import { ALL_ASSETS, type AssetDefinition } from './seed-data/assets';
import {
	generate401kBalances,
	generateAutoLoanBalances,
	generateBitcoinBalances,
	generateCollectibleBalances,
	generateEthereumBalances,
	generateGamestopBalances,
	generateRothIraBalances,
	generateSpyBalances,
	generateVehicleBalances,
	generateWalletBalances,
	type AccountBalanceDefinition,
	type AssetBalanceDefinition
} from './seed-data/balances';
import {
	generateCheckingTransactions,
	generateCreditCardTransactions,
	generateSavingsTransactions,
	type TransactionDefinition
} from './seed-data/transactions';

type IdMap = Record<string, string>;

const ALL_LABELS = [
	'Rent',
	'Payroll & benefits',
	'Transfers',
	'Payments',
	'Automotive',
	'Groceries',
	'Food & drink',
	'Restaurants',
	'Subscriptions',
	'Shops',
	'Gas stations',
	'Internet & phone',
	'Insurance',
	'Furnishings',
	'Home maintenance',
	'Electronics',
	'Music',
	'Health',
	'Office supplies',
	'Entertainment & recreation',
	'Financial & banking',
	'Fees'
];

async function createBalanceTypes(pb: TypedPocketBase, owner: string): Promise<IdMap> {
	const balanceTypeNames = [
		...new Set([...ALL_ACCOUNTS.map((a) => a.balanceType), ...ALL_ASSETS.map((a) => a.balanceType)])
	];

	const cache: IdMap = {};
	for (const name of balanceTypeNames) {
		const created = await pb.collection('balanceTypes').create({ name, owner });
		cache[name] = created.id;
	}
	return cache;
}

async function createLabels(pb: TypedPocketBase, owner: string): Promise<IdMap> {
	const cache: IdMap = {};
	for (const name of ALL_LABELS) {
		const created = await pb.collection('transactionLabels').create({ name, owner });
		cache[name] = created.id;
	}
	return cache;
}

async function createAccount(
	pb: TypedPocketBase,
	account: AccountDefinition,
	owner: string,
	balanceTypeCache: IdMap
): Promise<string> {
	const created = await pb.collection('accounts').create({
		name: account.name,
		balanceGroup: account.balanceGroup,
		balanceType: balanceTypeCache[account.balanceType],
		institution: account.institution,
		owner,
		autoCalculated: account.isAutoCalculated ? new Date().toISOString() : undefined
	});

	return created.id;
}

async function createAsset(
	pb: TypedPocketBase,
	asset: AssetDefinition,
	owner: string,
	balanceTypeCache: IdMap
): Promise<string> {
	const created = await pb.collection('assets').create({
		name: asset.name,
		balanceGroup: asset.balanceGroup,
		balanceType: balanceTypeCache[asset.balanceType],
		type: asset.type,
		symbol: asset.symbol,
		owner
	});

	return created.id;
}

async function createTransactions(
	pb: TypedPocketBase,
	transactions: TransactionDefinition[],
	accountId: string,
	owner: string,
	labelCache: IdMap
): Promise<void> {
	const createPromises = transactions.map((tx) =>
		pb.collection('transactions').create({
			account: accountId,
			owner,
			date: tx.date,
			description: tx.description,
			value: tx.value,
			labels: [labelCache[tx.label]],
			excluded: tx.isExcluded ? new Date().toISOString() : undefined
		})
	);

	await Promise.all(createPromises);
}

async function createAccountBalances(
	pb: TypedPocketBase,
	balances: AccountBalanceDefinition[],
	accountId: string,
	owner: string
): Promise<void> {
	const createPromises = balances.map((balance) =>
		pb.collection('accountBalances').create({
			account: accountId,
			owner,
			asOf: balance.asOf,
			value: balance.value
		})
	);

	await Promise.all(createPromises);
}

async function createAssetBalances(
	pb: TypedPocketBase,
	balances: AssetBalanceDefinition[],
	assetId: string,
	owner: string
): Promise<void> {
	const createPromises = balances.map((balance) =>
		pb.collection('assetBalances').create({
			asset: assetId,
			owner,
			asOf: balance.asOf,
			quantity: balance.quantity,
			bookValue: balance.bookValue,
			marketValue: balance.marketValue
		})
	);

	await Promise.all(createPromises);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function seedDemoData(pb: TypedPocketBase, userId: string): Promise<void> {
	// Disable auto-cancellation for bulk operations
	pb.autoCancellation(false);

	// Use current date as reference so transactions span the last 2 years
	const referenceDate = new Date();

	// Create balance types and labels first (sequentially to avoid conflicts)
	const balanceTypeCache = await createBalanceTypes(pb, userId);
	const labelCache = await createLabels(pb, userId);

	// Create all accounts
	const accountIds: IdMap = {};
	for (const account of ALL_ACCOUNTS) {
		accountIds[account.name] = await createAccount(pb, account, userId, balanceTypeCache);
	}

	// Create all assets
	const assetIds: IdMap = {};
	for (const asset of ALL_ASSETS) {
		assetIds[asset.name] = await createAsset(pb, asset, userId, balanceTypeCache);
	}

	// Create transactions for auto-calculated accounts (parallel)
	await Promise.all([
		createTransactions(
			pb,
			generateCheckingTransactions(referenceDate),
			accountIds[ACCOUNT_CHECKING.name],
			userId,
			labelCache
		),
		createTransactions(
			pb,
			generateSavingsTransactions(referenceDate),
			accountIds[ACCOUNT_SAVINGS.name],
			userId,
			labelCache
		),
		createTransactions(
			pb,
			generateCreditCardTransactions(referenceDate),
			accountIds[ACCOUNT_CREDIT_CARD.name],
			userId,
			labelCache
		)
	]);

	// Create account balances for manual accounts (parallel)
	await Promise.all([
		createAccountBalances(
			pb,
			generateAutoLoanBalances(referenceDate),
			accountIds[ACCOUNT_AUTO_LOAN.name],
			userId
		),
		createAccountBalances(
			pb,
			generateRothIraBalances(referenceDate),
			accountIds[ACCOUNT_ROTH_IRA.name],
			userId
		),
		createAccountBalances(
			pb,
			generate401kBalances(referenceDate),
			accountIds[ACCOUNT_401K.name],
			userId
		),
		createAccountBalances(
			pb,
			generateWalletBalances(referenceDate),
			accountIds[ACCOUNT_WALLET.name],
			userId
		)
	]);

	// Create asset balances (parallel)
	await Promise.all([
		createAssetBalances(
			pb,
			generateSpyBalances(referenceDate),
			assetIds['SPDR S&P 500 ETF Trust'],
			userId
		),
		createAssetBalances(pb, generateGamestopBalances(referenceDate), assetIds['GameStop'], userId),
		createAssetBalances(pb, generateBitcoinBalances(referenceDate), assetIds['Bitcoin'], userId),
		createAssetBalances(pb, generateEthereumBalances(referenceDate), assetIds['Ethereum'], userId),
		createAssetBalances(
			pb,
			generateCollectibleBalances(referenceDate),
			assetIds['Funko Pop Collection'],
			userId
		),
		createAssetBalances(
			pb,
			generateVehicleBalances(referenceDate),
			assetIds['1998 Fiat Multipla'],
			userId
		)
	]);

	// Wait for PocketBase Go hooks to complete debounced balance calculations.
	// The hooks use a 250ms trailing-edge debounce, so we wait 500ms to be safe.
	await sleep(500);
}
