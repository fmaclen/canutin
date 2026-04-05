import PocketBase from 'pocketbase';

import { env } from '$env/dynamic/public';
import type {
	AccountBalancesResponse,
	AccountsResponse,
	AssetBalancesResponse,
	AssetsResponse,
	BalanceTypesResponse,
	ImportSessionsResponse,
	TransactionLabelsResponse,
	TransactionsResponse
} from '$lib/pocketbase.schema';

type ImportAccount = {
	name: string;
	institution?: string;
	balanceGroup: 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';
	balanceType: string;
	autoCalculated?: boolean;
	closed?: boolean;
	excluded?: boolean;
	balance?: { value: number; asOf: string };
};

type ImportAsset = {
	name: string;
	symbol?: string;
	balanceGroup: 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';
	balanceType: string;
	type: 'WHOLE' | 'SHARES';
	sold?: boolean;
	excluded?: boolean;
	balance?: {
		marketValue?: number;
		bookValue?: number;
		quantity?: number;
		marketPrice?: number;
		bookPrice?: number;
		asOf: string;
	};
};

type ImportTransaction = {
	accountName: string;
	date: string;
	description?: string;
	value?: number;
	externalId?: string;
	labels?: string[];
	excluded?: boolean;
};

export type ImportPayload = {
	sessionLabel: string;
	accounts?: ImportAccount[];
	assets?: ImportAsset[];
	transactions?: ImportTransaction[];
};

export type ImportResult = {
	sessionId: string;
	accounts: { created: number; existing: number };
	assets: { created: number; existing: number };
	transactions: { created: number; skipped: number };
	accountBalances: { created: number; skipped: number };
	assetBalances: { created: number; skipped: number };
};

export function normalizeDescription(desc: string) {
	return desc.trim().replace(/\s+/g, ' ').toLowerCase();
}

function pbDateRange(isoDate: string) {
	const start = isoDate.split('T')[0] + ' 00:00:00.000Z';
	const dateObj = new Date(isoDate);
	dateObj.setUTCDate(dateObj.getUTCDate() + 1);
	const end = dateObj.toISOString().split('T')[0] + ' 00:00:00.000Z';
	return { start, end };
}

async function createAuthenticatedPbClient(authToken: string) {
	const pb = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');
	pb.authStore.save(authToken);
	pb.autoCancellation(false);
	const result = await pb.collection('users').authRefresh();
	return { pb, userId: result.record.id };
}

async function findOrCreateBalanceType(
	pb: PocketBase,
	name: string,
	ownerId: string,
	cache: Map<string, string>
) {
	const cacheKey = `${name}::${ownerId}`;
	if (cache.has(cacheKey)) return cache.get(cacheKey)!;

	try {
		const existing = await pb
			.collection('balanceTypes')
			.getFirstListItem<BalanceTypesResponse>(`name = "${name}" && owner = "${ownerId}"`);
		cache.set(cacheKey, existing.id);
		return existing.id;
	} catch {
		const created = await pb
			.collection('balanceTypes')
			.create<BalanceTypesResponse>({ name, owner: ownerId });
		cache.set(cacheKey, created.id);
		return created.id;
	}
}

async function findOrCreateLabel(
	pb: PocketBase,
	name: string,
	ownerId: string,
	cache: Map<string, string>
) {
	const cacheKey = `${name}::${ownerId}`;
	if (cache.has(cacheKey)) return cache.get(cacheKey)!;

	try {
		const existing = await pb
			.collection('transactionLabels')
			.getFirstListItem<TransactionLabelsResponse>(`name = "${name}" && owner = "${ownerId}"`);
		cache.set(cacheKey, existing.id);
		return existing.id;
	} catch {
		const created = await pb
			.collection('transactionLabels')
			.create<TransactionLabelsResponse>({ name, owner: ownerId });
		cache.set(cacheKey, created.id);
		return created.id;
	}
}

async function findOrCreateAccount(
	pb: PocketBase,
	account: ImportAccount,
	ownerId: string,
	balanceTypeId: string,
	sessionId: string,
	cache: Map<string, string>
) {
	const institution = account.institution || '';
	const cacheKey = `${account.name}::${institution}::${account.balanceGroup}::${ownerId}`;
	if (cache.has(cacheKey)) return { id: cache.get(cacheKey)!, created: false };

	const filter = institution
		? `name = "${account.name}" && institution = "${institution}" && balanceGroup = "${account.balanceGroup}" && owner = "${ownerId}"`
		: `name = "${account.name}" && balanceGroup = "${account.balanceGroup}" && owner = "${ownerId}"`;

	try {
		const existing = await pb.collection('accounts').getFirstListItem<AccountsResponse>(filter);
		cache.set(cacheKey, existing.id);
		return { id: existing.id, created: false };
	} catch {
		const now = new Date().toISOString();
		const created = await pb.collection('accounts').create<AccountsResponse>({
			name: account.name,
			institution: account.institution || '',
			balanceGroup: account.balanceGroup,
			balanceType: balanceTypeId,
			autoCalculated: account.autoCalculated ? now : '',
			closed: account.closed ? now : '',
			excluded: account.excluded ? now : '',
			owner: ownerId,
			importSession: sessionId
		});
		cache.set(cacheKey, created.id);
		return { id: created.id, created: true };
	}
}

async function findOrCreateAsset(
	pb: PocketBase,
	asset: ImportAsset,
	ownerId: string,
	balanceTypeId: string,
	sessionId: string,
	cache: Map<string, string>
) {
	const symbol = asset.symbol || '';
	const cacheKey = `${asset.name}::${symbol}::${ownerId}`;
	if (cache.has(cacheKey)) return { id: cache.get(cacheKey)!, created: false };

	const filter = symbol
		? `name = "${asset.name}" && symbol = "${symbol}" && owner = "${ownerId}"`
		: `name = "${asset.name}" && owner = "${ownerId}"`;

	try {
		const existing = await pb.collection('assets').getFirstListItem<AssetsResponse>(filter);
		cache.set(cacheKey, existing.id);
		return { id: existing.id, created: false };
	} catch {
		const now = new Date().toISOString();
		const created = await pb.collection('assets').create<AssetsResponse>({
			name: asset.name,
			symbol: asset.symbol || '',
			balanceGroup: asset.balanceGroup,
			balanceType: balanceTypeId,
			type: asset.type,
			sold: asset.sold ? now : '',
			excluded: asset.excluded ? now : '',
			owner: ownerId,
			importSession: sessionId
		});
		cache.set(cacheKey, created.id);
		return { id: created.id, created: true };
	}
}

async function accountBalanceExists(
	pb: PocketBase,
	accountId: string,
	asOf: string,
	value: number,
	ownerId: string
) {
	const { start, end } = pbDateRange(asOf);
	try {
		await pb
			.collection('accountBalances')
			.getFirstListItem<AccountBalancesResponse>(
				`account = "${accountId}" && asOf >= "${start}" && asOf < "${end}" && value = ${value} && owner = "${ownerId}"`
			);
		return true;
	} catch {
		return false;
	}
}

async function assetBalanceExists(
	pb: PocketBase,
	assetId: string,
	asOf: string,
	marketValue: number,
	ownerId: string
) {
	const { start, end } = pbDateRange(asOf);
	try {
		await pb
			.collection('assetBalances')
			.getFirstListItem<AssetBalancesResponse>(
				`asset = "${assetId}" && asOf >= "${start}" && asOf < "${end}" && marketValue = ${marketValue} && owner = "${ownerId}"`
			);
		return true;
	} catch {
		return false;
	}
}

async function transactionIsDuplicate(
	pb: PocketBase,
	accountId: string,
	tx: ImportTransaction,
	ownerId: string
) {
	if (tx.externalId) {
		try {
			await pb
				.collection('transactions')
				.getFirstListItem<TransactionsResponse>(
					`account = "${accountId}" && externalId = "${tx.externalId}" && owner = "${ownerId}"`
				);
			return true;
		} catch {
			return false;
		}
	}

	const normalizedDesc = normalizeDescription(tx.description || '');
	const value = tx.value ?? 0;

	const { start, end } = pbDateRange(tx.date);

	try {
		const candidates = await pb.collection('transactions').getList<TransactionsResponse>(1, 50, {
			filter: `account = "${accountId}" && date >= "${start}" && date < "${end}" && value = ${value} && owner = "${ownerId}"`
		});

		return candidates.items.some(
			(existing) => normalizeDescription(existing.description || '') === normalizedDesc
		);
	} catch {
		return false;
	}
}

export async function processImport(payload: ImportPayload, authToken: string) {
	const { pb, userId } = await createAuthenticatedPbClient(authToken);

	const result: ImportResult = {
		sessionId: '',
		accounts: { created: 0, existing: 0 },
		assets: { created: 0, existing: 0 },
		transactions: { created: 0, skipped: 0 },
		accountBalances: { created: 0, skipped: 0 },
		assetBalances: { created: 0, skipped: 0 }
	};

	const session = await pb.collection('importSessions').create<ImportSessionsResponse>({
		label: payload.sessionLabel,
		owner: userId,
		recordsCreated: 0,
		recordsSkipped: 0,
		status: 'completed'
	});
	result.sessionId = session.id;

	const balanceTypeCache = new Map<string, string>();
	const labelCache = new Map<string, string>();
	const accountCache = new Map<string, string>();
	const assetCache = new Map<string, string>();

	if (payload.accounts) {
		for (const account of payload.accounts) {
			const balanceTypeId = await findOrCreateBalanceType(
				pb,
				account.balanceType,
				userId,
				balanceTypeCache
			);

			const { id: accountId, created } = await findOrCreateAccount(
				pb,
				account,
				userId,
				balanceTypeId,
				session.id,
				accountCache
			);

			if (created) {
				result.accounts.created++;
			} else {
				result.accounts.existing++;
			}

			if (account.balance) {
				const exists = await accountBalanceExists(
					pb,
					accountId,
					account.balance.asOf,
					account.balance.value,
					userId
				);

				if (!exists) {
					await pb.collection('accountBalances').create({
						account: accountId,
						value: account.balance.value,
						asOf: account.balance.asOf,
						owner: userId,
						importSession: session.id
					});
					result.accountBalances.created++;
				} else {
					result.accountBalances.skipped++;
				}
			}
		}
	}

	if (payload.assets) {
		for (const asset of payload.assets) {
			const balanceTypeId = await findOrCreateBalanceType(
				pb,
				asset.balanceType,
				userId,
				balanceTypeCache
			);

			const { id: assetId, created } = await findOrCreateAsset(
				pb,
				asset,
				userId,
				balanceTypeId,
				session.id,
				assetCache
			);

			if (created) {
				result.assets.created++;
			} else {
				result.assets.existing++;
			}

			if (asset.balance) {
				const marketValue = asset.balance.marketValue ?? 0;
				const exists = await assetBalanceExists(
					pb,
					assetId,
					asset.balance.asOf,
					marketValue,
					userId
				);

				if (!exists) {
					await pb.collection('assetBalances').create({
						asset: assetId,
						marketValue,
						bookValue: asset.balance.bookValue ?? 0,
						quantity: asset.balance.quantity ?? 0,
						marketPrice: asset.balance.marketPrice ?? 0,
						bookPrice: asset.balance.bookPrice ?? 0,
						asOf: asset.balance.asOf,
						owner: userId,
						importSession: session.id
					});
					result.assetBalances.created++;
				} else {
					result.assetBalances.skipped++;
				}
			}
		}
	}

	if (payload.transactions) {
		for (const tx of payload.transactions) {
			const accountId =
				accountCache.get(`${tx.accountName}::::${userId}`) ??
				accountCache.get(
					Array.from(accountCache.keys()).find((k) => k.startsWith(`${tx.accountName}::`)) || ''
				);

			if (!accountId) {
				try {
					const found = await pb
						.collection('accounts')
						.getFirstListItem<AccountsResponse>(
							`name = "${tx.accountName}" && owner = "${userId}"`
						);
					accountCache.set(`${tx.accountName}::::${userId}`, found.id);
					await processTransaction(pb, tx, found.id, userId, session.id, labelCache, result);
				} catch {
					result.transactions.skipped++;
				}
				continue;
			}

			await processTransaction(pb, tx, accountId, userId, session.id, labelCache, result);
		}
	}

	const totalCreated =
		result.accounts.created +
		result.assets.created +
		result.transactions.created +
		result.accountBalances.created +
		result.assetBalances.created;
	const totalSkipped =
		result.accounts.existing +
		result.assets.existing +
		result.transactions.skipped +
		result.accountBalances.skipped +
		result.assetBalances.skipped;

	await pb.collection('importSessions').update(session.id, {
		recordsCreated: totalCreated,
		recordsSkipped: totalSkipped
	});

	return result;
}

async function processTransaction(
	pb: PocketBase,
	tx: ImportTransaction,
	accountId: string,
	userId: string,
	sessionId: string,
	labelCache: Map<string, string>,
	result: ImportResult
) {
	const isDuplicate = await transactionIsDuplicate(pb, accountId, tx, userId);

	if (isDuplicate) {
		result.transactions.skipped++;
		return;
	}

	const labelIds: string[] = [];
	if (tx.labels) {
		for (const labelName of tx.labels) {
			const labelId = await findOrCreateLabel(pb, labelName, userId, labelCache);
			labelIds.push(labelId);
		}
	}

	const now = new Date().toISOString();
	await pb.collection('transactions').create({
		account: accountId,
		date: tx.date,
		description: tx.description || '',
		value: tx.value ?? 0,
		externalId: tx.externalId || '',
		labels: labelIds,
		excluded: tx.excluded ? now : '',
		owner: userId,
		importSession: sessionId
	});

	result.transactions.created++;
}

const REVERT_COLLECTIONS = [
	'transactions',
	'accountBalances',
	'assetBalances',
	'accounts',
	'assets'
] as const;

export type RevertResult = {
	sessionId: string;
	deleted: number;
};

export async function revertImport(sessionId: string, authToken: string) {
	const { pb, userId } = await createAuthenticatedPbClient(authToken);

	const session = await pb.collection('importSessions').getOne<ImportSessionsResponse>(sessionId);

	if (session.owner !== userId) throw new Error('Unauthorized');
	if (session.status === 'rolled_back') throw new Error('Session already reverted');

	let totalDeleted = 0;

	for (const collection of REVERT_COLLECTIONS) {
		let hasMore = true;
		while (hasMore) {
			const records = await pb.collection(collection).getList(1, 100, {
				filter: `importSession = "${sessionId}" && owner = "${userId}"`
			});
			for (const record of records.items) {
				await pb.collection(collection).delete(record.id);
				totalDeleted++;
			}
			hasMore = records.totalItems > records.items.length;
		}
	}

	await pb.collection('importSessions').update(sessionId, {
		status: 'rolled_back',
		recordsCreated: 0
	});

	return { sessionId, deleted: totalDeleted } satisfies RevertResult;
}
