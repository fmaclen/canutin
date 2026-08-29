// Migrate a Canutin v1 vault (SQLite) into Canutin v2 through the bulk import API.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import PocketBase from 'pocketbase';

function log(msg: string) {
	console.log(`[pb:import] ${msg}`);
}

function error(msg: string) {
	console.error(`[pb:import] ERROR: ${msg}`);
}

function printUsage() {
	console.log(`Migrate a Canutin v1 vault into your Canutin v2 account.

Usage:
  bun run pb:import <vault-path> --email <email> --password <password> [options]

Arguments:
  <vault-path>          Path to the Canutin v1 .vault file

Options:
  --email <email>       Email of the Canutin account to import into
  --password <pass>     Password of that account
  --pb-url <url>        Canutin server URL (default: $PUBLIC_PB_URL)
  --currency <code>     Currency of the vault's accounts and assets (default: USD).
                        Canutin v1 vaults hold a single currency; the code must already
                        exist in your Canutin currency settings
  --label <label>       Name for this import, shown in Canutin settings
                        (default: the vault's filename)

The account must already exist - sign up in Canutin first, then run this.
Everything imported is tagged as one import, so it can be undone from Canutin settings.`);
}

type Options = {
	vaultPath: string;
	email: string;
	password: string;
	pbUrl: string;
	currency: string;
	label: string;
};

function parseArgs(args: string[]) {
	const positional: string[] = [];
	const flags = new Map<string, string>();

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === '--help' || arg === '-h') return null;
		if (arg.startsWith('--')) {
			const value = args[i + 1];
			if (value === undefined || value.startsWith('--')) {
				throw new Error(`Missing value for ${arg}`);
			}
			flags.set(arg, value.trim());
			i += 1;
			continue;
		}
		positional.push(arg);
	}

	const known = ['--email', '--password', '--pb-url', '--currency', '--label'];
	for (const flag of flags.keys()) {
		if (!known.includes(flag)) throw new Error(`Unknown option: ${flag}`);
	}

	const vaultPath = positional[0];
	if (!vaultPath) throw new Error('Missing the path to your Canutin v1 .vault file');

	const email = flags.get('--email');
	if (!email) throw new Error('Missing --email (the Canutin account to import into)');

	const password = flags.get('--password');
	if (!password) throw new Error('Missing --password (the password for that account)');

	const pbUrl = flags.get('--pb-url') ?? process.env.PUBLIC_PB_URL;
	if (!pbUrl) throw new Error('Missing --pb-url (the URL of your Canutin server)');

	const currency = (flags.get('--currency') ?? 'USD').toUpperCase();
	if (!/^[A-Z0-9]{2,10}$/.test(currency)) {
		throw new Error(`Invalid --currency "${currency}", expected a code like USD or EUR`);
	}

	return {
		vaultPath: path.resolve(vaultPath),
		email,
		password,
		pbUrl,
		currency,
		label: flags.get('--label') || path.basename(vaultPath)
	} satisfies Options;
}

// v1 stored balance groups as an ordinal on the Account and Asset tables.
const BALANCE_GROUPS = ['CASH', 'DEBT', 'INVESTMENT', 'OTHER'];

// v1 timestamps are epoch milliseconds; the import API takes ISO dates.
function toIsoDate(epochMs: number) {
	return new Date(epochMs).toISOString();
}

type VaultRow = { id: number; name: string };

function readVault(vaultPath: string, currency: string) {
	const db = new Database(vaultPath, { readonly: true });

	const nameById = (rows: VaultRow[]) => new Map(rows.map((row) => [row.id, row.name]));
	const accountTypes = nameById(db.query('SELECT id, name FROM AccountType').all() as VaultRow[]);
	const assetTypes = nameById(db.query('SELECT id, name FROM AssetType').all() as VaultRow[]);
	const categoryGroups = nameById(
		db.query('SELECT id, name FROM TransactionCategoryGroup').all() as VaultRow[]
	);
	const categories = new Map(
		(
			db
				.query('SELECT id, name, transactionCategoryId AS groupId FROM TransactionCategory')
				.all() as Array<VaultRow & { groupId: number }>
		).map((row) => [row.id, { name: row.name, groupName: categoryGroups.get(row.groupId) }])
	);

	const accountRows = db
		.query(
			`SELECT id, name, institution, isClosed, isAutoCalculated, isExcludedFromNetWorth,
			        balanceGroup, accountTypeId
			 FROM Account ORDER BY id`
		)
		.all() as Array<{
		id: number;
		name: string;
		institution: string | null;
		isClosed: number;
		isAutoCalculated: number;
		isExcludedFromNetWorth: number;
		balanceGroup: number;
		accountTypeId: number;
	}>;

	const assetRows = db
		.query(
			`SELECT id, name, balanceGroup, isSold, isExcludedFromNetWorth, assetTypeId
			 FROM Asset ORDER BY id`
		)
		.all() as Array<{
		id: number;
		name: string;
		balanceGroup: number;
		isSold: number;
		isExcludedFromNetWorth: number;
		assetTypeId: number;
	}>;

	const accountBalanceRows = db
		.query('SELECT accountId, value, createdAt FROM AccountBalanceStatement ORDER BY createdAt')
		.all() as Array<{ accountId: number; value: number; createdAt: number }>;

	const assetBalanceRows = db
		.query('SELECT assetId, value, createdAt FROM AssetBalanceStatement ORDER BY createdAt')
		.all() as Array<{ assetId: number; value: number; createdAt: number }>;

	const transactionRows = db
		.query(
			`SELECT description, date, value, isExcluded, categoryId, accountId
			 FROM "Transaction" ORDER BY id`
		)
		.all() as Array<{
		description: string;
		date: number;
		value: number;
		isExcluded: number;
		categoryId: number;
		accountId: number;
	}>;

	db.close();

	const accountsById = new Map(
		accountRows.map((row) => [
			row.id,
			{
				name: row.name,
				institution: row.institution ?? '',
				balanceGroup: BALANCE_GROUPS[row.balanceGroup],
				balanceType: accountTypes.get(row.accountTypeId) ?? '',
				currency,
				autoCalculated: Boolean(row.isAutoCalculated),
				closed: Boolean(row.isClosed),
				excluded: Boolean(row.isExcludedFromNetWorth)
			}
		])
	);

	const assetsById = new Map(
		assetRows.map((row) => [
			row.id,
			{
				name: row.name,
				balanceGroup: BALANCE_GROUPS[row.balanceGroup],
				balanceType: assetTypes.get(row.assetTypeId) ?? '',
				currency,
				sold: Boolean(row.isSold),
				excluded: Boolean(row.isExcludedFromNetWorth)
			}
		])
	);

	// The import API carries one balance snapshot per account/asset entry, so a v1 balance
	// history becomes one repeated entry per statement. Repeats resolve to the same record
	// because accounts and assets are deduplicated by name.
	const accounts = [...accountsById.values()].map((account) => ({ ...account }));
	for (const row of accountBalanceRows) {
		const account = accountsById.get(row.accountId);
		if (!account) continue;
		accounts.push({ ...account, balance: { value: row.value, asOf: toIsoDate(row.createdAt) } });
	}

	const assets = [...assetsById.values()].map((asset) => ({ ...asset }));
	for (const row of assetBalanceRows) {
		const asset = assetsById.get(row.assetId);
		if (!asset) continue;
		assets.push({ ...asset, balance: { marketValue: row.value, asOf: toIsoDate(row.createdAt) } });
	}

	const transactions = transactionRows.flatMap((row) => {
		const account = accountsById.get(row.accountId);
		if (!account) return [];
		const category = categories.get(row.categoryId);
		// v1 categories were nested inside a group; v2 labels are flat, so both become labels.
		// A category named after its own group collapses to a single label.
		const labels = [...new Set([category?.name, category?.groupName].filter(Boolean))];
		return [
			{
				accountName: account.name,
				institution: account.institution,
				balanceGroup: account.balanceGroup,
				date: toIsoDate(row.date),
				description: row.description,
				value: row.value,
				excluded: Boolean(row.isExcluded),
				labels
			}
		];
	});

	return {
		accounts,
		assets,
		transactions,
		vaultCounts: {
			accounts: accountRows.length,
			assets: assetRows.length,
			accountBalances: accountBalanceRows.length,
			assetBalances: assetBalanceRows.length,
			transactions: transactionRows.length
		}
	};
}

async function main() {
	let options: Options | null;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (e) {
		error((e as Error).message);
		console.log('');
		printUsage();
		process.exit(1);
	}

	if (!options) {
		printUsage();
		return;
	}

	try {
		await fs.access(options.vaultPath);
	} catch {
		error(`No vault file at ${options.vaultPath}`);
		process.exit(1);
	}

	const pb = new PocketBase(options.pbUrl);
	try {
		await pb.collection('users').authWithPassword(options.email, options.password);
	} catch (e) {
		error(`Could not sign in as ${options.email} at ${options.pbUrl}`);
		error((e as Error).message);
		process.exit(1);
	}

	const { accounts, assets, transactions, vaultCounts } = readVault(
		options.vaultPath,
		options.currency
	);
	log(
		`Read ${vaultCounts.accounts} accounts, ${vaultCounts.assets} assets, ${vaultCounts.transactions} transactions, ` +
			`${vaultCounts.accountBalances + vaultCounts.assetBalances} balance statements from ${path.basename(options.vaultPath)}`
	);

	log(`Importing into ${options.email} as "${options.label}"`);
	let result: { recordsFailed: number };
	try {
		result = await pb.send('/api/canutin/import', {
			method: 'POST',
			body: { sessionLabel: options.label, accounts, assets, transactions }
		});
	} catch (e) {
		const response = (e as { response?: { error?: string; missingCurrencies?: string[] } })
			.response;
		if (response?.missingCurrencies?.length) {
			error(
				`Add the currency ${response.missingCurrencies.join(', ')} in Canutin settings, then run this again`
			);
		} else {
			error(`Import failed: ${response?.error ?? (e as Error).message}`);
		}
		process.exit(1);
	}

	console.log(JSON.stringify(result, null, 2));
	if (result.recordsFailed) {
		error(`${result.recordsFailed} records could not be imported - see the server log for details`);
		process.exit(1);
	}
	log('Import complete. To undo it, revert the import from Canutin settings.');
}

main().catch((e) => {
	error((e as Error).message);
	process.exit(1);
});
