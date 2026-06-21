import { expect, test } from '@playwright/test';

import type { TypedPocketBase } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getUserPB,
	PB_URL,
	pbSend,
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

function importPayload(sessionLabel: string) {
	return {
		sessionLabel,
		accounts: [
			{
				name: 'Nathan Checking',
				institution: 'First National',
				balanceGroup: 'CASH',
				balanceType: 'Checking',
				autoCalculated: true,
				balance: { value: 3000, asOf: '2025-06-15T00:00:00.000Z' }
			},
			{
				name: 'Nathan Credit Card',
				institution: 'First National',
				balanceGroup: 'DEBT',
				balanceType: 'Credit Card',
				balance: { value: -450, asOf: '2025-06-15T00:00:00.000Z' }
			}
		],
		assets: [
			{
				name: 'Nathan Rental Property',
				balanceGroup: 'INVESTMENT',
				balanceType: 'Property',
				balance: {
					marketValue: 275000,
					bookValue: 250000,
					asOf: '2025-06-15T00:00:00.000Z'
				}
			}
		],
		transactions: [
			{
				accountName: 'Nathan Checking',
				date: '2025-06-10T00:00:00.000Z',
				description: 'Payroll Deposit',
				value: 2500,
				externalId: 'txn-001',
				labels: ['Payroll']
			},
			{
				accountName: 'Nathan Checking',
				date: '2025-06-11T00:00:00.000Z',
				description: 'Grocery Store',
				value: -85.5,
				labels: ['Groceries']
			},
			{
				accountName: 'Nathan Credit Card',
				date: '2025-06-12T00:00:00.000Z',
				description: 'Online Purchase',
				value: -42.99,
				externalId: 'txn-cc-001'
			}
		]
	};
}

const IMPORT_PATH = '/api/canutin/import';

test('settings page shows empty state when no imports exist', async ({ page }) => {
	const user = await seedUser('wendy');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('No imports yet')).toBeVisible();
});

test('bulk import creates records and displays in settings', async ({ page }) => {
	const user = await seedUser('nathan');

	const response = await pbSend(
		IMPORT_PATH,
		importPayload('nathan-scraper-2025-06-15'),
		user.email
	);
	const result = await response.json();

	expect(response.status).toBe(200);
	expect(result.accounts.created).toBe(2);
	expect(result.accounts.existing).toBe(0);
	expect(result.transactions.created).toBe(3);
	expect(result.transactions.skipped).toBe(0);
	expect(result.accountBalances.created).toBe(2);
	expect(result.accountBalances.skipped).toBe(0);
	expect(result.assets.created).toBe(1);
	expect(result.assets.existing).toBe(0);
	expect(result.assetBalances.created).toBe(1);
	expect(result.assetBalances.skipped).toBe(0);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('nathan-scraper-2025-06-15')).toBeVisible();
	await expect(page.getByText('Completed')).toBeVisible();
});

test('duplicate import skips existing records', async ({ page }) => {
	const user = await seedUser('olivia');
	const payload = importPayload('olivia-scraper-run-1');

	const firstResult = await (await pbSend(IMPORT_PATH, payload, user.email)).json();

	expect(firstResult.accounts.created).toBe(2);
	expect(firstResult.transactions.created).toBe(3);
	expect(firstResult.accountBalances.created).toBe(2);
	expect(firstResult.assets.created).toBe(1);
	expect(firstResult.assetBalances.created).toBe(1);

	payload.sessionLabel = 'olivia-scraper-run-2';
	const secondResult = await (await pbSend(IMPORT_PATH, payload, user.email)).json();

	expect(secondResult.accounts.created).toBe(0);
	expect(secondResult.accounts.existing).toBe(2);
	expect(secondResult.transactions.created).toBe(0);
	expect(secondResult.transactions.skipped).toBe(3);
	expect(secondResult.accountBalances.created).toBe(0);
	expect(secondResult.accountBalances.skipped).toBe(2);
	expect(secondResult.assets.created).toBe(0);
	expect(secondResult.assets.existing).toBe(1);
	expect(secondResult.assetBalances.created).toBe(0);
	expect(secondResult.assetBalances.skipped).toBe(1);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('olivia-scraper-run-1')).toBeVisible();
	await expect(page.getByText('olivia-scraper-run-2')).toBeVisible();
});

test('externalId dedup takes precedence over field-based dedup', async () => {
	const user = await seedUser('patricia');

	const payload1 = {
		sessionLabel: 'patricia-run-1',
		accounts: [{ name: 'Patricia Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
		transactions: [
			{
				accountName: 'Patricia Checking',
				date: '2025-07-01T00:00:00.000Z',
				description: 'Coffee Shop',
				value: -5.0,
				externalId: 'ext-001'
			}
		]
	};

	const firstResult = await (await pbSend(IMPORT_PATH, payload1, user.email)).json();
	expect(firstResult.transactions.created).toBe(1);

	const payload2 = {
		sessionLabel: 'patricia-run-2',
		transactions: [
			{
				accountName: 'Patricia Checking',
				date: '2025-07-01T00:00:00.000Z',
				description: 'Coffee Shop Updated',
				value: -5.5,
				externalId: 'ext-001'
			}
		]
	};

	const secondResult = await (await pbSend(IMPORT_PATH, payload2, user.email)).json();
	expect(secondResult.transactions.skipped).toBe(1);
});

test('dedup works with space-separated date format from scrapers', async () => {
	const user = await seedUser('paula');

	const payload = {
		sessionLabel: 'paula-run-1',
		accounts: [{ name: 'Paula Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
		transactions: [
			{
				accountName: 'Paula Checking',
				date: '2025-08-25 00:00:00.000Z',
				description: 'GROCERY STORE',
				value: -85.5
			}
		]
	};

	const first = await (await pbSend(IMPORT_PATH, payload, user.email)).json();
	expect(first.transactions.created).toBe(1);

	payload.sessionLabel = 'paula-run-2';
	const second = await (await pbSend(IMPORT_PATH, payload, user.email)).json();
	expect(second.transactions.created).toBe(0);
	expect(second.transactions.skipped).toBe(1);
});

test('description normalization handles whitespace and casing', async () => {
	const user = await seedUser('quinn');

	const payload1 = {
		sessionLabel: 'quinn-run-1',
		accounts: [{ name: 'Quinn Savings', balanceGroup: 'CASH', balanceType: 'Savings' }],
		transactions: [
			{
				accountName: 'Quinn Savings',
				date: '2025-08-01T00:00:00.000Z',
				description: 'AMAZON  PURCHASE',
				value: -29.99
			}
		]
	};

	await pbSend(IMPORT_PATH, payload1, user.email);

	const payload2 = {
		sessionLabel: 'quinn-run-2',
		transactions: [
			{
				accountName: 'Quinn Savings',
				date: '2025-08-01T00:00:00.000Z',
				description: 'amazon purchase',
				value: -29.99
			}
		]
	};

	const result = await (await pbSend(IMPORT_PATH, payload2, user.email)).json();
	expect(result.transactions.skipped).toBe(1);
	expect(result.transactions.created).toBe(0);
});

test('reverting an import deletes its records and updates status', async ({ page }) => {
	const user = await seedUser('samuel');

	const result = await (
		await pbSend(IMPORT_PATH, importPayload('samuel-scraper-to-revert'), user.email)
	).json();

	expect(result.transactions.created).toBe(3);
	expect(result.accounts.created).toBe(2);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('samuel-scraper-to-revert')).toBeVisible();
	await expect(page.getByText('Completed')).toBeVisible();

	await page.getByRole('button', { name: 'Revert' }).first().click();
	await expect(page.getByText('This will permanently delete all records')).toBeVisible();

	await page.getByRole('alertdialog').getByRole('button', { name: 'Revert' }).click();
	await expect(page.getByText('Import reverted')).toBeVisible();

	await expect(page.getByText('Rolled back')).toBeVisible();

	const pb = await getUserPB(user.email);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(0);

	const accounts = await pb.collection('accounts').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(accounts.length).toBe(0);
});

test('revert rejects injection-like session IDs', async () => {
	const user = await seedUser('tanya');
	const REVERT_PATH = '/api/canutin/import/revert';

	const injectionPayloads = [
		'" || owner != "',
		'"; DROP TABLE transactions; --',
		'aaaaaaaaaaaaaaa" || 1=1 || "'
	];

	for (const malicious of injectionPayloads) {
		const response = await pbSend(REVERT_PATH, { sessionId: malicious }, user.email);
		expect(response.status).not.toBe(200);
	}
});

test('revert non-existent session returns 404', async () => {
	const user = await seedUser('ursula');
	const response = await pbSend(
		'/api/canutin/import/revert',
		{ sessionId: 'nonexistent00000' },
		user.email
	);
	expect(response.status).toBe(404);
});

test('same-name accounts resolve by institution and balance group tuple', async () => {
	const user = await seedUser('victor');

	const payload = {
		sessionLabel: 'victor-multi-institution',
		accounts: [
			{
				name: 'Savings',
				institution: 'Bank A',
				balanceGroup: 'CASH',
				balanceType: 'Savings'
			},
			{
				name: 'Savings',
				institution: 'Bank B',
				balanceGroup: 'CASH',
				balanceType: 'Savings'
			}
		],
		transactions: [
			{
				accountName: 'Savings',
				institution: 'Bank B',
				balanceGroup: 'CASH',
				date: '2025-09-01T00:00:00.000Z',
				description: 'Deposit at Bank B',
				value: 100,
				externalId: 'bankB-001'
			}
		]
	};

	const result = await (await pbSend(IMPORT_PATH, payload, user.email)).json();
	expect(result.status).toBe('completed');
	expect(result.accounts.created).toBe(2);
	expect(result.recordsFailed).toBe(0);
	expect(result.transactions.created).toBe(1);

	const pb = await getUserPB(user.email);
	const bankB = await pb
		.collection('accounts')
		.getFirstListItem(`name = "Savings" && institution = "Bank B" && owner = "${user.id}"`);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(1);
	expect(transactions[0].account).toBe(bankB.id);
});

test('same-name accounts resolve by explicit accountId', async () => {
	const user = await seedUser('vincent');
	const bankA = await seedAccount({
		name: 'Savings',
		institution: 'Bank A',
		balanceGroup: 'CASH',
		balanceType: 'Savings',
		owner: user.id
	});
	const bankB = await seedAccount({
		name: 'Savings',
		institution: 'Bank B',
		balanceGroup: 'CASH',
		balanceType: 'Savings',
		owner: user.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'vincent-account-id',
				transactions: [
					{
						accountId: bankB.id,
						accountName: 'Savings',
						date: '2025-09-02T00:00:00.000Z',
						description: 'Deposit by id',
						value: 250,
						externalId: 'vincent-001'
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.recordsFailed).toBe(0);
	expect(result.transactions.created).toBe(1);

	const pb = await getUserPB(user.email);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(1);
	expect(transactions[0].account).toBe(bankB.id);

	const onBankA = await pb.collection('transactions').getFullList({
		filter: `account = "${bankA.id}"`
	});
	expect(onBankA.length).toBe(0);
});

test('ambiguous same-name transaction becomes a row error and is not created', async () => {
	const user = await seedUser('valerie');
	await seedAccount({
		name: 'Savings',
		institution: 'Bank A',
		balanceGroup: 'CASH',
		balanceType: 'Savings',
		owner: user.id
	});
	await seedAccount({
		name: 'Savings',
		institution: 'Bank B',
		balanceGroup: 'CASH',
		balanceType: 'Savings',
		owner: user.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'valerie-ambiguous',
				transactions: [
					{
						accountName: 'Savings',
						date: '2025-09-03T00:00:00.000Z',
						description: 'Ambiguous deposit',
						value: 75
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('failed');
	expect(result.recordsFailed).toBe(1);
	expect(result.transactions.created).toBe(0);

	const pb = await getUserPB(user.email);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(0);
});

test('legacy single-name transaction resolves to its only owned account', async () => {
	const user = await seedUser('valentina');
	const checking = await seedAccount({
		name: 'Valentina Checking',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: user.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'valentina-legacy',
				transactions: [
					{
						accountName: 'Valentina Checking',
						date: '2025-09-04T00:00:00.000Z',
						description: 'Legacy deposit',
						value: 500
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.recordsFailed).toBe(0);
	expect(result.transactions.created).toBe(1);

	const pb = await getUserPB(user.email);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(1);
	expect(transactions[0].account).toBe(checking.id);
});

test('foreign accountId is rejected and nothing lands on the other user account', async () => {
	const owner = await seedUser('victoria');
	const intruder = await seedUser('vladimir');
	const ownerAccount = await seedAccount({
		name: 'Victoria Checking',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: owner.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'vladimir-foreign-id',
				transactions: [
					{
						accountId: ownerAccount.id,
						accountName: 'Victoria Checking',
						date: '2025-09-05T00:00:00.000Z',
						description: 'Cross-owner deposit',
						value: 999
					}
				]
			},
			intruder.email
		)
	).json();
	expect(result.status).toBe('failed');
	expect(result.recordsFailed).toBe(1);
	expect(result.transactions.created).toBe(0);

	const pb = await getUserPB(owner.email);
	const onOwnerAccount = await pb.collection('transactions').getFullList({
		filter: `account = "${ownerAccount.id}"`
	});
	expect(onOwnerAccount.length).toBe(0);

	const intruderPB = await getUserPB(intruder.email);
	const intruderTransactions = await intruderPB.collection('transactions').getFullList({
		filter: `owner = "${intruder.id}"`
	});
	expect(intruderTransactions.length).toBe(0);
});

test('revert cleans up orphaned labels and balance types', async () => {
	const user = await seedUser('wanda');

	const result = await (
		await pbSend(IMPORT_PATH, importPayload('wanda-to-revert'), user.email)
	).json();
	expect(result.transactions.created).toBe(3);

	const pb = await getUserPB(user.email);

	const labelsBefore = await pb.collection('transactionLabels').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(labelsBefore.length).toBeGreaterThan(0);

	const balanceTypesBefore = await pb.collection('balanceTypes').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balanceTypesBefore.length).toBeGreaterThan(0);

	await pbSend('/api/canutin/import/revert', { sessionId: result.sessionId }, user.email);

	const labelsAfter = await pb.collection('transactionLabels').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(labelsAfter.length).toBe(0);

	const balanceTypesAfter = await pb.collection('balanceTypes').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balanceTypesAfter.length).toBe(0);
});

test('import rejects requests without auth', async () => {
	const response = await pbSend(IMPORT_PATH, importPayload('no-auth-test'));
	expect(response.status).toBe(401);
});

test('import rejects empty payload and creates no session', async () => {
	const user = await seedUser('rachel');
	const response = await pbSend(IMPORT_PATH, { sessionLabel: 'empty-import' }, user.email);
	expect(response.status).toBe(400);

	const pb = await getUserPB(user.email);
	const sessions = await pb.collection('importSessions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(sessions.length).toBe(0);
});

test('import rejects invalid preflight payload and creates no session', async () => {
	const user = await seedUser('rebecca');
	const response = await pbSend(
		IMPORT_PATH,
		{
			sessionLabel: 'invalid-preflight',
			accounts: [{ name: 'Rebecca Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
			transactions: [{ accountName: 'Rebecca Checking', description: 'Missing date', value: 5 }]
		},
		user.email
	);
	const result = await response.json();

	expect(response.status).toBe(400);
	expect(result.errors).toContainEqual(expect.objectContaining({ field: 'transactions[0].date' }));

	const pb = await getUserPB(user.email);
	const sessions = await pb.collection('importSessions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(sessions.length).toBe(0);
});

test('import rejects too many records and creates no session', async () => {
	const user = await seedUser('reuben');
	const transactions = Array.from({ length: 100_001 }, () => ({
		accountName: 'Reuben Checking',
		date: '2025-01-01T00:00:00.000Z',
		description: 'Bulk',
		value: 1
	}));
	const response = await pbSend(
		IMPORT_PATH,
		{
			sessionLabel: 'too-many-records',
			accounts: [{ name: 'Reuben Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
			transactions
		},
		user.email
	);
	const result = await response.json();

	expect(response.status).toBe(400);
	expect(result.errors).toContainEqual(expect.objectContaining({ field: 'transactions' }));

	const pb = await getUserPB(user.email);
	const sessions = await pb.collection('importSessions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(sessions.length).toBe(0);
});

test('import rejects an oversized body and creates no session', async () => {
	const user = await seedUser('rhonda');
	const pb = await getUserPB(user.email);

	// A description larger than the 64 MiB body cap trips http.MaxBytesReader during decode,
	// before any importSessions record is created.
	const oversized = 'x'.repeat(64 * 1024 * 1024 + 1024);
	// HACK: An oversized body is refused either way. The server may finish reading and return a
	// clean 413, or it may stop reading after the limit and reset the socket mid-write, which the
	// client sees as a connection-level error (ECONNRESET / "fetch failed"). Both prove the body
	// was refused, so we accept either outcome and reject only an unexpected success status.
	// Connection: close keeps the failed request from poisoning a keep-alive socket.
	let status: number | null = null;
	try {
		const response = await fetch(`${PB_URL}${IMPORT_PATH}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${pb.authStore.token}`,
				Connection: 'close'
			},
			body: JSON.stringify({
				sessionLabel: 'oversized-body',
				transactions: [
					{
						accountName: 'Rhonda Checking',
						date: '2025-01-01T00:00:00.000Z',
						value: 1,
						description: oversized
					}
				]
			})
		});
		await response.arrayBuffer();
		status = response.status;
	} catch {
		// Connection-level rejection counts as the body being refused.
	}

	if (status !== null) expect(status).toBe(413);

	// Fresh connection: the oversized request may have torn down its socket, so reuse nothing.
	const freshPB = await getUserPB(user.email);
	const sessions = await freshPB.collection('importSessions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(sessions.length).toBe(0);
});

test('mixed valid and invalid rows complete with errors and persist the valid rows', async () => {
	const user = await seedUser('ricardo');
	const response = await pbSend(
		IMPORT_PATH,
		{
			sessionLabel: 'ricardo-partial',
			accounts: [{ name: 'Ricardo Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
			transactions: [
				{
					accountName: 'Ricardo Checking',
					date: '2025-06-10T00:00:00.000Z',
					description: 'Valid deposit',
					value: 100
				},
				{
					accountName: 'Ghost Account',
					date: '2025-06-11T00:00:00.000Z',
					description: 'Unresolvable account',
					value: -50
				}
			]
		},
		user.email
	);
	const result = await response.json();

	expect(response.status).toBe(200);
	expect(result.status).toBe('completed_with_errors');
	expect(result.recordsFailed).toBe(1);
	expect(result.transactions.created).toBe(1);

	const pb = await getUserPB(user.email);
	const session = await pb.collection('importSessions').getOne(result.sessionId);
	expect(session.status).toBe('completed_with_errors');
	expect(session.recordsFailed).toBe(1);
	expect(session.recordsCreated).toBeGreaterThan(0);

	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(1);
	expect(transactions[0].description).toBe('Valid deposit');
});

test('settings shows the completed-with-errors status and failed count', async ({ page }) => {
	const user = await seedUser('rosa');
	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'rosa-partial-import',
				accounts: [{ name: 'Rosa Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
				transactions: [
					{
						accountName: 'Rosa Checking',
						date: '2025-06-10T00:00:00.000Z',
						description: 'Valid deposit',
						value: 100
					},
					{
						accountName: 'Ghost Account',
						date: '2025-06-11T00:00:00.000Z',
						description: 'Unresolvable account',
						value: -50
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed_with_errors');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');

	await expect(page.getByText('rosa-partial-import')).toBeVisible();
	await expect(page.getByText('Completed with errors')).toBeVisible();

	const row = page.getByRole('row').filter({ hasText: 'rosa-partial-import' });
	const failedCell = row.getByRole('cell').nth(4);
	await expect(failedCell).toHaveText('1');
});

test('import accepts security and cryptocurrency balance types in assets payload', async () => {
	const user = await seedUser('xavier');
	const importedAssets = [
		{
			name: 'Xavier Security',
			balanceGroup: 'INVESTMENT',
			balanceType: 'Security',
			balance: { marketValue: 1000, bookValue: 900, asOf: '2025-10-01T00:00:00.000Z' }
		},
		{
			name: 'Xavier Crypto',
			balanceGroup: 'INVESTMENT',
			balanceType: 'Cryptocurrency',
			balance: { marketValue: 2000, bookValue: 1500, asOf: '2025-10-01T00:00:00.000Z' }
		}
	];

	const response = await pbSend(
		IMPORT_PATH,
		{ sessionLabel: 'xavier-security-assets', assets: importedAssets },
		user.email
	);
	const result = await response.json();
	expect(response.status).toBe(200);
	expect(result.assets.created).toBe(2);
	expect(result.assetBalances.created).toBe(2);
	expect(result.securities.created).toBe(0);

	const pb = await getUserPB(user.email);
	const assets = await pb.collection('assets').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(assets.map((asset) => asset.name).sort()).toEqual(['Xavier Crypto', 'Xavier Security']);

	const securities = await pb.collection('securities').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(securities.length).toBe(0);
});

async function listAccountBalances(pb: TypedPocketBase, account: string) {
	return pb.collection('accountBalances').getFullList({
		filter: `account = "${account}"`,
		sort: '-asOf,-created,-id'
	});
}

test('reverting an import into an existing account leaves no stale derived balance', async () => {
	const user = await seedUser('sabrina');
	const account = await seedAccount({
		name: 'Sabrina Checking',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: user.id,
		autoCalculated: new Date().toISOString()
	});

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-06-01T00:00:00.000Z',
		description: 'Pre-existing deposit',
		value: 100
	});

	const pb = await getUserPB(user.email);

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'sabrina-into-existing',
				transactions: [
					{
						accountId: account.id,
						accountName: 'Sabrina Checking',
						date: '2025-06-10T00:00:00.000Z',
						description: 'Imported deposit',
						value: 900,
						externalId: 'sabrina-txn-001'
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.transactions.created).toBe(1);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(1000);

	await pbSend('/api/canutin/import/revert', { sessionId: result.sessionId }, user.email);

	const remainingTransactions = await pb.collection('transactions').getFullList({
		filter: `account = "${account.id}"`
	});
	expect(remainingTransactions.map((tx) => tx.description)).toEqual(['Pre-existing deposit']);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(100);

	const balances = await listAccountBalances(pb, account.id);
	expect(balances.map((balance) => balance.value)).toEqual(balances.map(() => 100));
});

test('deleting a single imported transaction outside revert recomputes the derived balance', async () => {
	const user = await seedUser('seamus');
	const account = await seedAccount({
		name: 'Seamus Checking',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: user.id,
		autoCalculated: new Date().toISOString()
	});

	const pb = await getUserPB(user.email);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-06-01T00:00:00.000Z',
		description: 'Pre-existing deposit',
		value: 100
	});

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(100);

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'seamus-into-existing',
				transactions: [
					{
						accountId: account.id,
						accountName: 'Seamus Checking',
						date: '2025-06-10T00:00:00.000Z',
						description: 'Imported deposit',
						value: 900,
						externalId: 'seamus-txn-001'
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.transactions.created).toBe(1);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(1000);

	const imported = await pb
		.collection('transactions')
		.getFirstListItem(`externalId = "seamus-txn-001" && owner = "${user.id}"`);
	await pb.collection('transactions').delete(imported.id);

	const remainingTransactions = await pb.collection('transactions').getFullList({
		filter: `account = "${account.id}"`
	});
	expect(remainingTransactions.map((tx) => tx.description)).toEqual(['Pre-existing deposit']);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(100);
});

test('reverting an import preserves a manual balance on the account', async () => {
	const user = await seedUser('serena');
	const account = await seedAccount({
		name: 'Serena Checking',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: user.id,
		autoCalculated: new Date().toISOString()
	});

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-06-01T00:00:00.000Z',
		description: 'Pre-existing deposit',
		value: 100
	});

	const manualBalance = await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: '2025-05-01T00:00:00.000Z',
		value: 777
	});

	const pb = await getUserPB(user.email);

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'serena-into-existing',
				transactions: [
					{
						accountId: account.id,
						accountName: 'Serena Checking',
						date: '2025-06-10T00:00:00.000Z',
						description: 'Imported deposit',
						value: 900,
						externalId: 'serena-txn-001'
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.transactions.created).toBe(1);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(1000);

	await pbSend('/api/canutin/import/revert', { sessionId: result.sessionId }, user.email);

	const remainingTransactions = await pb.collection('transactions').getFullList({
		filter: `account = "${account.id}"`
	});
	expect(remainingTransactions.map((tx) => tx.description)).toEqual(['Pre-existing deposit']);

	await expect
		.poll(async () =>
			(await listAccountBalances(pb, account.id))
				.filter((balance) => balance.source === 'derived')
				.map((balance) => balance.value)
		)
		.toEqual(expect.arrayContaining([100]));

	const derivedBalances = (await listAccountBalances(pb, account.id)).filter(
		(balance) => balance.source === 'derived'
	);
	expect(derivedBalances.map((balance) => balance.value)).toEqual(derivedBalances.map(() => 100));

	const preservedManual = await pb.collection('accountBalances').getOne(manualBalance.id);
	expect(preservedManual.source).toBe('manual');
	expect(preservedManual.value).toBe(777);
});

test('reverting an import preserves pre-existing derived balance history', async () => {
	const user = await seedUser('sienna');
	const account = await seedAccount({
		name: 'Sienna Checking',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: user.id,
		autoCalculated: new Date().toISOString()
	});

	const pb = await getUserPB(user.email);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-04-01T00:00:00.000Z',
		description: 'First pre-existing deposit',
		value: 250
	});
	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(250);
	const historicalSnapshot = (await listAccountBalances(pb, account.id)).find(
		(balance) => balance.source === 'derived' && balance.value === 250
	)!;

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-05-01T00:00:00.000Z',
		description: 'Second pre-existing deposit',
		value: 100
	});
	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(350);

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'sienna-into-existing',
				transactions: [
					{
						accountId: account.id,
						accountName: 'Sienna Checking',
						date: '2025-06-10T00:00:00.000Z',
						description: 'Imported deposit',
						value: 900,
						externalId: 'sienna-txn-001'
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.transactions.created).toBe(1);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(1250);

	await pbSend('/api/canutin/import/revert', { sessionId: result.sessionId }, user.email);

	const remainingTransactions = await pb.collection('transactions').getFullList({
		filter: `account = "${account.id}"`
	});
	expect(remainingTransactions.map((tx) => tx.description)).toEqual([
		'First pre-existing deposit',
		'Second pre-existing deposit'
	]);

	const preservedHistory = await pb.collection('accountBalances').getOne(historicalSnapshot.id);
	expect(preservedHistory.source).toBe('derived');
	expect(preservedHistory.value).toBe(250);

	await expect.poll(async () => (await listAccountBalances(pb, account.id))[0]?.value).toBe(350);
});
