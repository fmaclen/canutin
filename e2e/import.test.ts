import { expect, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { getUserPB, pbSend, seedUser } from './pocketbase.helpers';

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
				name: 'SPDR S&P 500',
				symbol: 'SPY',
				balanceGroup: 'INVESTMENT',
				balanceType: 'ETF',
				type: 'SHARES',
				balance: {
					quantity: 10,
					marketPrice: 550,
					bookPrice: 450,
					marketValue: 5500,
					bookValue: 4500,
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

function securitiesImportPayload(sessionLabel: string, quantity: number, amount: number) {
	return {
		sessionLabel,
		accounts: [
			{
				name: 'Yara Brokerage',
				institution: 'Northstar',
				balanceGroup: 'INVESTMENT',
				balanceType: 'Brokerage'
			}
		],
		securityBalances: [
			{
				accountName: 'Yara Brokerage',
				securityName: 'Vanguard Total Stock Market ETF',
				securitySymbol: 'VTI',
				asOf: '2025-10-15T00:00:00.000Z',
				quantity,
				price: 100,
				value: amount,
				costBasis: 900
			}
		],
		securityTransactions: [
			{
				accountName: 'Yara Brokerage',
				securityName: 'Vanguard Total Stock Market ETF',
				securitySymbol: 'VTI',
				date: '2025-10-15T00:00:00.000Z',
				type: 'buy',
				description: 'VTI purchase',
				quantity,
				price: 100,
				amount,
				fees: 0
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

test('existing account imports security records', async () => {
	const user = await seedUser('vance');

	await pbSend(
		IMPORT_PATH,
		{
			sessionLabel: 'vance-account-run-1',
			accounts: [
				{
					name: 'Vance Brokerage',
					institution: 'Northstar',
					balanceGroup: 'INVESTMENT',
					balanceType: 'Brokerage'
				}
			]
		},
		user.email
	);

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'vance-account-run-2',
				accounts: [
					{
						name: 'Vance Brokerage',
						institution: 'Northstar',
						balanceGroup: 'INVESTMENT',
						balanceType: 'Brokerage'
					}
				],
				securityBalances: [
					{
						accountName: 'Vance Brokerage',
						securityName: 'SPDR S&P 500 ETF Trust',
						securitySymbol: 'SPY',
						asOf: '2025-10-01T00:00:00.000Z',
						quantity: 0,
						value: 0
					}
				]
			},
			user.email
		)
	).json();

	expect(result.accounts.created).toBe(0);
	expect(result.accounts.existing).toBe(1);
	expect(result.securityBalances.created).toBe(1);
	expect(result.securityBalances.skipped).toBe(0);
});

test('security imports skip duplicates and allow changed same-day snapshots', async () => {
	const user = await seedUser('yara');

	const firstResult = await (
		await pbSend(IMPORT_PATH, securitiesImportPayload('yara-run-1', 10, 1000), user.email)
	).json();
	expect(firstResult.securityBalances.created).toBe(1);
	expect(firstResult.securityTransactions.created).toBe(1);

	const secondResult = await (
		await pbSend(IMPORT_PATH, securitiesImportPayload('yara-run-2', 10, 1000), user.email)
	).json();
	expect(secondResult.securityBalances.created).toBe(0);
	expect(secondResult.securityBalances.skipped).toBe(1);
	expect(secondResult.securityTransactions.created).toBe(0);
	expect(secondResult.securityTransactions.skipped).toBe(1);

	const changedSnapshotResult = await (
		await pbSend(IMPORT_PATH, securitiesImportPayload('yara-run-3', 11, 1100), user.email)
	).json();
	expect(changedSnapshotResult.securityBalances.created).toBe(1);
	expect(changedSnapshotResult.securityBalances.skipped).toBe(0);
});

test('security JSON numeric fields reject non-number shapes', async () => {
	const user = await seedUser('zelda');

	await pbSend(IMPORT_PATH, securitiesImportPayload('zelda-run-1', 10, 1000), user.email);

	const pb = await getUserPB(user.email);
	const account = await pb
		.collection('accounts')
		.getFirstListItem(`name = "Yara Brokerage" && owner = "${user.id}"`);
	const security = await pb
		.collection('securities')
		.getFirstListItem(`symbol = "VTI" && owner = "${user.id}"`);

	const balance = await pb.collection('securityBalances').create({
		account: account.id,
		security: security.id,
		owner: user.id,
		asOf: '2025-10-16T00:00:00.000Z',
		quantity: 0,
		value: null
	});
	expect(balance.quantity).toBe(0);
	expect(balance.value).toBeNull();

	await expect(
		pb.collection('securityBalances').create({
			account: account.id,
			security: security.id,
			owner: user.id,
			asOf: '2025-10-17T00:00:00.000Z',
			quantity: { value: 1 }
		})
	).rejects.toThrow();

	await expect(
		pb.collection('securityTransactions').create({
			account: account.id,
			security: security.id,
			owner: user.id,
			date: '2025-10-17T00:00:00.000Z',
			type: 'buy',
			name: 'Invalid amount',
			amount: [1]
		})
	).rejects.toThrow();
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

test('same-name accounts at different institutions resolve correctly', async () => {
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
				date: '2025-09-01T00:00:00.000Z',
				description: 'Deposit at Bank A',
				value: 100,
				externalId: 'bankA-001'
			}
		]
	};

	const result = await (await pbSend(IMPORT_PATH, payload, user.email)).json();
	expect(result.accounts.created).toBe(2);
	expect(result.transactions.created).toBe(1);
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

test('import rejects empty payload', async () => {
	const user = await seedUser('rachel');
	const response = await pbSend(IMPORT_PATH, { sessionLabel: 'empty-import' }, user.email);
	expect(response.status).toBe(400);
});
