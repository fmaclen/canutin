import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { DEFAULT_PASSWORD, seedUser } from './pocketbase.helpers';

const PB_URL = 'http://127.0.0.1:42070';

async function authenticateUser(email: string) {
	const pb = new PocketBase(PB_URL);
	await pb.collection('users').authWithPassword(email, DEFAULT_PASSWORD);
	return pb.authStore.token;
}

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

test('bulk import creates records and displays in settings', async ({ page, baseURL }) => {
	const user = await seedUser('nathan');
	const token = await authenticateUser(user.email);

	const response = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(importPayload('nathan-scraper-2025-06-15'))
	});
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

test('duplicate import skips existing records', async ({ page, baseURL }) => {
	const user = await seedUser('olivia');
	const token = await authenticateUser(user.email);
	const payload = importPayload('olivia-scraper-run-1');

	const first = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload)
	});
	const firstResult = await first.json();

	expect(firstResult.accounts.created).toBe(2);
	expect(firstResult.transactions.created).toBe(3);
	expect(firstResult.accountBalances.created).toBe(2);

	payload.sessionLabel = 'olivia-scraper-run-2';
	const second = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload)
	});
	const secondResult = await second.json();

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

test('externalId dedup takes precedence over field-based dedup', async ({ baseURL }) => {
	const user = await seedUser('patricia');
	const token = await authenticateUser(user.email);

	const payload1 = {
		sessionLabel: 'patricia-run-1',
		accounts: [
			{
				name: 'Patricia Checking',
				balanceGroup: 'CASH',
				balanceType: 'Checking'
			}
		],
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

	const first = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload1)
	});
	expect((await first.json()).transactions.created).toBe(1);

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

	const second = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload2)
	});
	expect((await second.json()).transactions.skipped).toBe(1);
});

test('description normalization handles whitespace and casing', async ({ baseURL }) => {
	const user = await seedUser('quinn');
	const token = await authenticateUser(user.email);

	const payload1 = {
		sessionLabel: 'quinn-run-1',
		accounts: [
			{
				name: 'Quinn Savings',
				balanceGroup: 'CASH',
				balanceType: 'Savings'
			}
		],
		transactions: [
			{
				accountName: 'Quinn Savings',
				date: '2025-08-01T00:00:00.000Z',
				description: 'AMAZON  PURCHASE',
				value: -29.99
			}
		]
	};

	await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload1)
	});

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

	const second = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload2)
	});
	const result = await second.json();

	expect(result.transactions.skipped).toBe(1);
	expect(result.transactions.created).toBe(0);
});

test('reverting an import deletes its records and updates status', async ({ page, baseURL }) => {
	const user = await seedUser('samuel');
	const token = await authenticateUser(user.email);

	const response = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(importPayload('samuel-scraper-to-revert'))
	});
	const result = await response.json();

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

	const pb = new PocketBase(PB_URL);
	await pb.collection('users').authWithPassword(user.email, DEFAULT_PASSWORD);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(0);

	const accounts = await pb.collection('accounts').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(accounts.length).toBe(0);
});

test('import rejects requests without auth', async ({ baseURL }) => {
	const response = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(importPayload('no-auth-test'))
	});

	expect(response.status).toBe(401);
});

test('import rejects empty payload', async ({ baseURL }) => {
	const user = await seedUser('rachel');
	const token = await authenticateUser(user.email);

	const response = await fetch(`${baseURL}/api/import`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({ sessionLabel: 'empty-import' })
	});

	expect(response.status).toBe(400);
});
