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
import { ALL_ASSETS } from './seed-data/assets';
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
	type AssetBalanceDefinition,
	type SecurityBalanceDefinition
} from './seed-data/balances';
import { ALL_SECURITIES } from './seed-data/securities';
import {
	generateCheckingTransactions,
	generateCreditCardTransactions,
	generateSavingsTransactions,
	type TransactionDefinition
} from './seed-data/transactions';

type IdMap = Record<string, string>;

const BATCH_SIZE = 10;

async function runInBatches<T, R>(items: T[], fn: (item: T) => Promise<R>) {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		const batch = items.slice(i, i + BATCH_SIZE);
		const batchResults = await Promise.all(batch.map(fn));
		results.push(...batchResults);
	}
	return results;
}

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

async function createBalanceTypes(pb: TypedPocketBase, owner: string) {
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

async function createLabels(pb: TypedPocketBase, owner: string) {
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
) {
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

async function createTransactions(
	pb: TypedPocketBase,
	transactions: TransactionDefinition[],
	accountId: string,
	owner: string,
	labelCache: IdMap
) {
	await runInBatches(transactions, (tx) =>
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
}

async function createAccountBalances(
	pb: TypedPocketBase,
	balances: AccountBalanceDefinition[],
	accountId: string,
	owner: string
) {
	await runInBatches(balances, (balance) =>
		pb.collection('accountBalances').create({
			account: accountId,
			owner,
			asOf: balance.asOf,
			value: balance.value
		})
	);
}

async function createAssetBalances(
	pb: TypedPocketBase,
	balances: AssetBalanceDefinition[],
	assetId: string,
	owner: string
) {
	await runInBatches(balances, (balance) =>
		pb.collection('assetBalances').create({
			asset: assetId,
			owner,
			asOf: balance.asOf,
			marketValue: balance.marketValue
		})
	);
}

async function createSecurityBalances(
	pb: TypedPocketBase,
	balances: SecurityBalanceDefinition[],
	securityId: string,
	accountId: string,
	owner: string
) {
	await runInBatches(balances, (balance) =>
		pb.collection('securityBalances').create({
			security: securityId,
			account: accountId,
			owner,
			asOf: balance.asOf,
			quantity: balance.quantity,
			price: balance.price,
			costBasis: balance.costBasis,
			value: balance.value
		})
	);
}

const AUTO_CALCULATED_ACCOUNTS = [ACCOUNT_CHECKING, ACCOUNT_SAVINGS, ACCOUNT_CREDIT_CARD];

async function waitForAutoCalculatedBalances(pb: TypedPocketBase, accountIds: string[]) {
	const maxAttempts = 50;
	const pollInterval = 100;
	// Go hooks create balance records with 250ms debounce; wait for count to stabilize
	const stabilityThreshold = 5;

	let lastCount = 0;
	let stablePolls = 0;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const balances = await pb.collection('accountBalances').getFullList({
			filter: accountIds.map((id) => `account = '${id}'`).join(' || '),
			requestKey: null
		});

		// Need at least one balance per account
		if (balances.length < accountIds.length) {
			lastCount = balances.length;
			stablePolls = 0;
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
			continue;
		}

		// Check if balance count has stabilized (no new balances being created)
		if (balances.length === lastCount) {
			stablePolls++;
			if (stablePolls >= stabilityThreshold) {
				return;
			}
		} else {
			lastCount = balances.length;
			stablePolls = 1;
		}

		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	console.warn('[demo:seed] Timed out waiting for auto-calculated balances to stabilize');
}

export async function seedDemoData(pb: TypedPocketBase, userId: string) {
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
		const created = await pb.collection('assets').create({
			name: asset.name,
			balanceGroup: asset.balanceGroup,
			balanceType: balanceTypeCache[asset.balanceType],
			owner: userId
		});
		assetIds[asset.name] = created.id;
	}

	const securityIds: IdMap = {};
	for (const security of ALL_SECURITIES) {
		const created = await pb.collection('securities').create({
			name: security.name,
			symbol: security.symbol,
			owner: userId
		});
		securityIds[security.name] = created.id;
	}

	// Create transactions for auto-calculated accounts (sequentially to reduce load)
	await createTransactions(
		pb,
		generateCheckingTransactions(referenceDate),
		accountIds[ACCOUNT_CHECKING.name],
		userId,
		labelCache
	);
	await createTransactions(
		pb,
		generateSavingsTransactions(referenceDate),
		accountIds[ACCOUNT_SAVINGS.name],
		userId,
		labelCache
	);
	await createTransactions(
		pb,
		generateCreditCardTransactions(referenceDate),
		accountIds[ACCOUNT_CREDIT_CARD.name],
		userId,
		labelCache
	);

	// Create account balances for manual accounts (sequentially)
	await createAccountBalances(
		pb,
		generateAutoLoanBalances(referenceDate),
		accountIds[ACCOUNT_AUTO_LOAN.name],
		userId
	);
	await createAccountBalances(
		pb,
		generateRothIraBalances(referenceDate),
		accountIds[ACCOUNT_ROTH_IRA.name],
		userId
	);
	await createAccountBalances(
		pb,
		generate401kBalances(referenceDate),
		accountIds[ACCOUNT_401K.name],
		userId
	);
	await createAccountBalances(
		pb,
		generateWalletBalances(referenceDate),
		accountIds[ACCOUNT_WALLET.name],
		userId
	);

	// Create security balances (sequentially)
	await createSecurityBalances(
		pb,
		generateSpyBalances(referenceDate),
		securityIds['SPDR S&P 500 ETF Trust'],
		accountIds[ACCOUNT_ROTH_IRA.name],
		userId
	);
	await createSecurityBalances(
		pb,
		generateGamestopBalances(referenceDate),
		securityIds['GameStop'],
		accountIds[ACCOUNT_401K.name],
		userId
	);
	await createSecurityBalances(
		pb,
		generateBitcoinBalances(referenceDate),
		securityIds['Bitcoin'],
		accountIds[ACCOUNT_ROTH_IRA.name],
		userId
	);
	await createSecurityBalances(
		pb,
		generateEthereumBalances(referenceDate),
		securityIds['Ethereum'],
		accountIds[ACCOUNT_ROTH_IRA.name],
		userId
	);

	// Create asset balances (sequentially)
	await createAssetBalances(
		pb,
		generateCollectibleBalances(referenceDate),
		assetIds['Funko Pop Collection'],
		userId
	);
	await createAssetBalances(
		pb,
		generateVehicleBalances(referenceDate),
		assetIds['1998 Fiat Multipla'],
		userId
	);

	// Wait for Go hooks to finish calculating balances for auto-calculated accounts
	const autoCalculatedAccountIds = AUTO_CALCULATED_ACCOUNTS.map((a) => accountIds[a.name]);
	await waitForAutoCalculatedBalances(pb, autoCalculatedAccountIds);
}
