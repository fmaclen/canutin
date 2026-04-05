import { expect, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { authenticateAsUser, pbSend, seedUser } from './pocketbase.helpers';

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

	payload.sessionLabel = 'olivia-scraper-run-2';
	const secondResult = await (await pbSend(IMPORT_PATH, payload, user.email)).json();

	expect(secondResult.accounts.created).toBe(0);
	expect(secondResult.accounts.existing).toBe(2);
	expect(secondResult.transactions.created).toBe(0);
	expect(secondResult.transactions.skipped).toBe(3);
	expect(secondResult.accountBalances.created).toBe(0);
	expect(secondResult.accountBalances.skipped).toBe(2);

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
	await expect(page.getByText('Import reverted successfully')).toBeVisible();

	await expect(page.getByText('Rolled back')).toBeVisible();

	const pb = await authenticateAsUser(user.email);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(0);

	const accounts = await pb.collection('accounts').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(accounts.length).toBe(0);
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
