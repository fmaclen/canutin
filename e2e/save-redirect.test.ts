import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions,
	AssetsTypeOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

test('balance sheet → account → save balance redirects back to /balance-sheet', async ({
	page
}) => {
	const user = await seedUser('daphne');

	const account = await seedAccount({
		name: 'Redirect Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto('/balance-sheet');

	await page.getByRole('link', { name: 'Redirect Checking' }).click();

	await expect(page).toHaveURL(
		new RegExp(`/accounts/${account.id}\\?from=(%2Fbalance-sheet|/balance-sheet)`)
	);

	await page.getByLabel('Balance', { exact: true }).fill('1500');
	await page.getByRole('button', { name: 'Update' }).click();

	await expect(page.getByText('Account added successfully')).toBeVisible();
	await expect(page).toHaveURL('/balance-sheet');
});

test('transactions with account filter → transaction → save preserves filter on return', async ({
	page
}) => {
	const user = await seedUser('ernest');

	const account = await seedAccount({
		name: 'Filter Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 500
	});
	const transaction = await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Redirect Coffee',
		value: -5
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/transactions?account=${account.id}`);

	const row = page.getByRole('row', { name: /Redirect Coffee/ });
	await expect(row).toBeVisible();
	await row.getByRole('link', { name: 'Redirect Coffee' }).click();

	const encodedFrom = encodeURIComponent(`/transactions?account=${account.id}`);
	await expect(page).toHaveURL(
		new RegExp(
			`/transactions/${transaction.id}\\?from=${encodedFrom.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
		)
	);

	await page.getByLabel('Description').fill('Redirect Coffee v2');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Transaction updated')).toBeVisible();
	await expect(page).toHaveURL(`/transactions?account=${account.id}`);
});

test('accounts list → account → save details redirects back to /accounts', async ({ page }) => {
	const user = await seedUser('fiona');

	const account = await seedAccount({
		name: 'List Redirect Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 750
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto('/accounts');

	const row = page.getByRole('row', { name: 'List Redirect Account' });
	await row.getByRole('link', { name: 'List Redirect Account' }).click();

	await expect(page).toHaveURL(
		new RegExp(`/accounts/${account.id}\\?from=(%2Faccounts|/accounts)`)
	);

	await page.getByLabel('Name').fill('List Redirect Renamed');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Account updated successfully')).toBeVisible();
	await expect(page).toHaveURL('/accounts');
});

test('assets list → asset → save balance redirects back to /assets', async ({ page }) => {
	const user = await seedUser('gideon');

	const asset = await seedAsset({
		name: 'List Redirect Asset',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Collectibles',
		type: AssetsTypeOptions.WHOLE
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 5000,
		marketValue: 5500
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto('/assets');

	const row = page.getByRole('row', { name: 'List Redirect Asset' });
	await row.getByRole('link', { name: 'List Redirect Asset' }).click();

	await expect(page).toHaveURL(new RegExp(`/assets/${asset.id}\\?from=(%2Fassets|/assets)`));

	await page.getByLabel('Market value', { exact: true }).fill('6000');
	await page.getByRole('button', { name: 'Update' }).click();

	await expect(page.getByText('Asset added successfully')).toBeVisible();
	await expect(page).toHaveURL('/assets');
});

test('transactions list (no filter) → transaction → save redirects back to /transactions', async ({
	page
}) => {
	const user = await seedUser('harriet');

	const account = await seedAccount({
		name: 'Plain Txn Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 200
	});
	const transaction = await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Plain Lunch',
		value: -12
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto('/transactions');

	const row = page.getByRole('row', { name: /Plain Lunch/ });
	await expect(row).toBeVisible();
	await row.getByRole('link', { name: 'Plain Lunch' }).click();

	await expect(page).toHaveURL(
		new RegExp(`/transactions/${transaction.id}\\?from=(%2Ftransactions|/transactions)`)
	);

	await page.getByLabel('Description').fill('Plain Lunch v2');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Transaction updated')).toBeVisible();
	await expect(page).toHaveURL('/transactions');
});

test('deep link to account with no ?from= stays on detail page after save', async ({ page }) => {
	const user = await seedUser('ingrid');

	const account = await seedAccount({
		name: 'Deep Link Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 300
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/accounts/${account.id}`);
	await expect(page).toHaveURL(`/accounts/${account.id}`);

	await page.getByLabel('Name').fill('Deep Link Renamed');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Account updated successfully')).toBeVisible();
	await expect(page).toHaveURL(`/accounts/${account.id}`);
});
