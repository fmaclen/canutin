import fs from 'node:fs/promises';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import PocketBase from 'pocketbase';

const PB_HOST = '127.0.0.1';
const PB_PORT = 42070;
const PB_SUPERUSER_EMAIL = 'superadmin@example.com';
const PB_SUPERUSER_PASSWORD = '123qweasdzxc';
const PB_BASE_URL = `http://${PB_HOST}:${PB_PORT}`;

function log(msg: string) {
	console.log(`[pb:import] ${msg}`);
}

function error(msg: string) {
	console.error(`[pb:import] ERROR: ${msg}`);
}

function mapBalanceGroup(
	n: number | null | undefined
): 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER' | undefined {
	if (n === null || n === undefined) return undefined;
	switch (Number(n)) {
		case 0:
			return 'CASH';
		case 1:
			return 'DEBT';
		case 2:
			return 'INVESTMENT';
		case 3:
			return 'OTHER';
		default:
			return undefined;
	}
}

function toISODate(d: unknown): string | undefined {
	if (!d) return undefined;
	// handle values like '2021-03-01 00:00:00' or ISO strings
	try {
		const s = String(d).trim();
		if (!s) return undefined;
		// Normalize to RFC3339 with milliseconds and Z
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00.000Z`;
		const iso = new Date(s).toISOString().replace('T', ' ').replace('Z', 'Z');
		return iso;
	} catch {
		return undefined;
	}
}

function normalizeDateOr(primary: unknown, fallback?: unknown): string | undefined {
	return toISODate(primary) ?? toISODate(fallback ?? '') ?? undefined;
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length < 1) {
		error('Missing required path to .vault file. Example: bun pb:import temp/Canutin.demo.vault');
		process.exit(1);
	}
	const vaultPath = path.resolve(args[0]);

	try {
		await fs.access(vaultPath);
	} catch {
		error(`Vault file not found: ${vaultPath}`);
		process.exit(1);
	}

	log(`Opening SQLite vault: ${vaultPath}`);
	const db = new Database(vaultPath, { readonly: true });

	// Prepare PocketBase client
	const pb = new PocketBase(PB_BASE_URL);

	log(`Authenticating as superuser at ${PB_BASE_URL} ...`);
	try {
		// With PB >=0.23 superusers are a system auth collection
		await pb.collection('_superusers').authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
	} catch (e) {
		error(`Failed to authenticate: ${(e as Error).message}`);
		process.exit(1);
	}

	// Helpers: upsert by name and cache ids
	const balanceTypeIdByName = new Map<string, string>();
	const txLabelIdByName = new Map<string, string>();

	async function upsertBalanceType(name: string): Promise<string> {
		const key = name.trim();
		if (balanceTypeIdByName.has(key)) return balanceTypeIdByName.get(key) as string;
		try {
			const existing = await pb
				.collection('balanceTypes')
				.getFirstListItem(`name = ${JSON.stringify(key)}`);
			balanceTypeIdByName.set(key, existing.id);
			return existing.id;
		} catch {
			const created = await pb.collection('balanceTypes').create({ name: key });
			balanceTypeIdByName.set(key, created.id);
			return created.id;
		}
	}

	async function upsertTxLabel(name: string): Promise<string> {
		const key = name.trim();
		if (txLabelIdByName.has(key)) return txLabelIdByName.get(key) as string;
		try {
			const existing = await pb
				.collection('transactionLabels')
				.getFirstListItem(`name = ${JSON.stringify(key)}`);
			txLabelIdByName.set(key, existing.id);
			return existing.id;
		} catch {
			const created = await pb.collection('transactionLabels').create({ name: key });
			txLabelIdByName.set(key, created.id);
			return created.id;
		}
	}

	// Load old reference tables
	type Ref = { id: number; name: string };
	const accountTypes = db.query('SELECT id, name FROM AccountType ORDER BY id').all() as Ref[];
	const assetTypes = db.query('SELECT id, name FROM AssetType ORDER BY id').all() as Ref[];
	const txGroups = db
		.query('SELECT id, name FROM TransactionCategoryGroup ORDER BY id')
		.all() as Ref[];
	const txCategories = db
		.query('SELECT id, name, transactionCategoryId FROM TransactionCategory ORDER BY id')
		.all() as Array<Ref & { transactionCategoryId: number }>;

	log(
		`Found: ${accountTypes.length} AccountType, ${assetTypes.length} AssetType, ${txGroups.length} Tx Groups, ${txCategories.length} Tx Categories`
	);

	const accountTypeNameById = new Map<number, string>(accountTypes.map((r) => [r.id, r.name]));
	const assetTypeNameById = new Map<number, string>(assetTypes.map((r) => [r.id, r.name]));
	const txGroupNameById = new Map<number, string>(txGroups.map((r) => [r.id, r.name]));
	const txCatNameById = new Map<number, string>(txCategories.map((r) => [r.id, r.name]));
	const txCatGroupIdByCatId = new Map<number, number>(
		txCategories.map((r) => [r.id, r.transactionCategoryId])
	);

	type AccountRow = {
		id: number;
		name: string;
		institution?: string | null;
		isClosed: number;
		isAutoCalculated: number;
		isExcludedFromNetWorth: number;
		balanceGroup: number;
		accountTypeId: number | null;
		createdAt?: string;
		updatedAt?: string;
	};
	const accounts = db
		.query(
			'SELECT id,name,institution,isClosed,isAutoCalculated,isExcludedFromNetWorth,balanceGroup,accountTypeId,createdAt,updatedAt FROM Account ORDER BY id'
		)
		.all() as AccountRow[];

	type AssetRow = {
		id: number;
		name: string;
		balanceGroup: number;
		isSold: number;
		symbol?: string | null;
		assetTypeId: number | null;
		isExcludedFromNetWorth: number;
		createdAt?: string;
		updatedAt?: string;
	};
	const assets = db
		.query(
			'SELECT id,name,balanceGroup,isSold,symbol,assetTypeId,isExcludedFromNetWorth,createdAt,updatedAt FROM Asset ORDER BY id'
		)
		.all() as AssetRow[];

	type AccBalRow = {
		id: number;
		value: number;
		accountId: number;
		createdAt?: string;
		updatedAt?: string;
	};
	const accountBalances = db
		.query(
			'SELECT id,value,accountId,createdAt,updatedAt FROM AccountBalanceStatement ORDER BY createdAt, id'
		)
		.all() as AccBalRow[];

	type AstBalRow = {
		id: number;
		value: number;
		quantity?: number | null;
		cost?: number | null;
		assetId: number;
		createdAt?: string;
		updatedAt?: string;
	};
	const assetBalances = db
		.query(
			'SELECT id,value,quantity,cost,assetId,createdAt,updatedAt FROM AssetBalanceStatement ORDER BY createdAt, id'
		)
		.all() as AstBalRow[];

	type TxRow = {
		id: number;
		description: string;
		date: string;
		value: number;
		isExcluded: number;
		isPending: number;
		categoryId: number | null;
		accountId: number;
		createdAt?: string;
		updatedAt?: string;
	};
	const transactions = db
		.query(
			'SELECT id,description,date,value,isExcluded,isPending,categoryId,accountId,createdAt,updatedAt FROM "Transaction" ORDER BY id'
		)
		.all() as TxRow[];

	log(
		`Rows: accounts=${accounts.length}, assets=${assets.length}, accountBalances=${accountBalances.length}, assetBalances=${assetBalances.length}, transactions=${transactions.length}`
	);

	// Create accounts and assets first
	const pbAccountIdByOldId = new Map<number, string>();
	const pbAssetIdByOldId = new Map<number, string>();

	for (const a of accounts) {
		const autoDate = a.isAutoCalculated
			? (normalizeDateOr(a.updatedAt, a.createdAt) ?? toISODate(new Date().toISOString()))
			: undefined;

		const data: Record<string, unknown> = {
			name: a.name,
			institution: a.institution ?? undefined,
			balanceGroup: mapBalanceGroup(a.balanceGroup),
			closed: a.isClosed ? normalizeDateOr(a.updatedAt, a.createdAt) : undefined,
			// For auto-calculated accounts, ensure a truthy RFC date even if updatedAt is null
			autoCalculated: autoDate,
			excluded: a.isExcludedFromNetWorth ? normalizeDateOr(a.updatedAt, a.createdAt) : undefined,
			created: toISODate(a.createdAt),
			updated: toISODate(a.updatedAt)
		};

		// BalanceType in PB is used to indicate computation mode such as "Auto-calculated".
		// If the legacy account is marked auto-calculated, set BalanceType to "Auto-calculated".
		// Otherwise, fallback to the legacy account type name if present.
		const typeName = a.accountTypeId ? accountTypeNameById.get(a.accountTypeId) : undefined;
		if (a.isAutoCalculated) {
			data.balanceType = await upsertBalanceType('Auto-calculated');
		} else if (typeName) {
			data.balanceType = await upsertBalanceType(typeName);
		}

		const created = await pb.collection('accounts').create(data);
		pbAccountIdByOldId.set(a.id, created.id);
	}

	for (const a of assets) {
		const data: Record<string, unknown> = {
			name: a.name,
			symbol: a.symbol ?? undefined,
			balanceGroup: mapBalanceGroup(a.balanceGroup),
			sold: a.isSold ? toISODate(a.updatedAt) : undefined,
			excluded: a.isExcludedFromNetWorth ? toISODate(a.updatedAt) : undefined,
			created: toISODate(a.createdAt),
			updated: toISODate(a.updatedAt)
		};
		const typeName = a.assetTypeId ? assetTypeNameById.get(a.assetTypeId) : undefined;
		if (typeName) data.balanceType = await upsertBalanceType(typeName);

		const created = await pb.collection('assets').create(data);
		pbAssetIdByOldId.set(a.id, created.id);
	}

	// Create balance records and group per parent for a single patch later
	const balancesByPbAccountId = new Map<string, string[]>();
	for (const s of accountBalances) {
		const pbAccountId = pbAccountIdByOldId.get(s.accountId);
		if (!pbAccountId) continue;
		const bal = await pb
			.collection('accountBalances')
			.create({ value: s.value, created: toISODate(s.createdAt), updated: toISODate(s.updatedAt) });
		const list = balancesByPbAccountId.get(pbAccountId) || [];
		list.push(bal.id);
		balancesByPbAccountId.set(pbAccountId, list);
	}

	const balancesByPbAssetId = new Map<string, string[]>();
	for (const s of assetBalances) {
		const pbAssetId = pbAssetIdByOldId.get(s.assetId);
		if (!pbAssetId) continue;
		const bal = await pb.collection('assetBalances').create({
			value: s.value,
			quantity: s.quantity ?? undefined,
			cost: s.cost ?? undefined,
			created: toISODate(s.createdAt),
			updated: toISODate(s.updatedAt)
		});
		const list = balancesByPbAssetId.get(pbAssetId) || [];
		list.push(bal.id);
		balancesByPbAssetId.set(pbAssetId, list);
	}

	// Create transactions and collect per-account
	const txIdsByPbAccountId = new Map<string, string[]>();
	for (const t of transactions) {
		const pbAccountId = pbAccountIdByOldId.get(t.accountId);
		if (!pbAccountId) continue;

		const labels: string[] = [];
		if (t.categoryId != null) {
			const catName = txCatNameById.get(t.categoryId);
			if (catName) labels.push(await upsertTxLabel(catName));
			const groupId = txCatGroupIdByCatId.get(t.categoryId);
			if (groupId) {
				const groupName = txGroupNameById.get(groupId);
				if (groupName) labels.push(await upsertTxLabel(groupName));
			}
		}

		const exDate = t.isExcluded
			? (normalizeDateOr(t.updatedAt, t.date) ?? toISODate(new Date().toISOString()))
			: undefined;
		const pendDate = t.isPending
			? (normalizeDateOr(t.updatedAt, t.date) ?? toISODate(new Date().toISOString()))
			: undefined;

		const data: Record<string, unknown> = {
			description: t.description,
			date: toISODate(t.date),
			value: t.value,
			excluded: exDate,
			pending: pendDate,
			created: toISODate(t.createdAt ?? t.date),
			updated: toISODate(t.updatedAt ?? t.date),
			labels
		};
		const created = await pb.collection('transactions').create(data);
		const list = txIdsByPbAccountId.get(pbAccountId) || [];
		list.push(created.id);
		txIdsByPbAccountId.set(pbAccountId, list);
	}

	// Patch accounts with relations
	const updatedAccounts = new Set<string>();
	for (const [pbId, ids] of balancesByPbAccountId) {
		const payload: Record<string, unknown> = { balances: ids };
		const txIds = txIdsByPbAccountId.get(pbId);
		if (txIds && txIds.length) payload.transactions = txIds;
		await pb.collection('accounts').update(pbId, payload);
		updatedAccounts.add(pbId);
	}
	// Ensure accounts with only transactions (no balances) get updated too
	for (const [pbId, txIds] of txIdsByPbAccountId) {
		if (updatedAccounts.has(pbId)) continue;
		await pb.collection('accounts').update(pbId, { transactions: txIds });
	}

	// Patch assets with relations
	for (const [pbId, ids] of balancesByPbAssetId) {
		await pb.collection('assets').update(pbId, { balances: ids });
	}

	log('Import complete.');
}

main().catch((e) => {
	error((e as Error).stack || (e as Error).message);
	process.exit(1);
});
