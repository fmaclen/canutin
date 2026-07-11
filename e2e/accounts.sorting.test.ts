import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test('sorts accounts by every column and preserves sorting across reloads and filters', async ({
	page
}) => {
	const user = await seedUser('abigail');
	const now = new Date().toISOString();

	// The dataset contains every account pair and trio used for balance, text, transaction-count, persistence, indicator, and filter sorting.
	const accounts = [
		{ name: 'Low Balance Account', value: 100 },
		{ name: 'High Balance Account', value: 5000, balanceType: 'Savings' },
		{ name: 'Mid Balance Account', value: 1000 },
		{ name: 'Zebra Account', value: 500 },
		{ name: 'Alpha Account', value: 500 },
		{ name: 'Chase Checking', value: 1000, institution: 'Chase Bank' },
		{
			name: 'Wells Fargo Savings',
			value: 2000,
			institution: 'Wells Fargo',
			balanceType: 'Savings'
		},
		{ name: 'Many Transactions', value: 1000 },
		{ name: 'Few Transactions', value: 2000 },
		{ name: 'Account One', value: 1000 },
		{ name: 'Account Two', value: 2000, balanceType: 'Savings' },
		{ name: 'Test Account', value: 1000 },
		{ name: 'Open Account', value: 3000 },
		{ name: 'Closed Account', value: 1000, balanceType: 'Savings', closed: now }
	];
	const accountIds = new Map<string, string>();
	for (const accountData of accounts) {
		const account = await seedAccount({
			name: accountData.name,
			institution: accountData.institution,
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: accountData.balanceType ?? 'Checking',
			closed: accountData.closed
		});
		accountIds.set(accountData.name, account.id);
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: now,
			value: accountData.value
		});
	}

	const manyTransactionsAccount = accountIds.get('Many Transactions');
	const fewTransactionsAccount = accountIds.get('Few Transactions');
	if (!manyTransactionsAccount || !fewTransactionsAccount) {
		throw new Error('Expected transaction-count accounts to be seeded');
	}
	for (let index = 0; index < 5; index++) {
		await seedTransaction({
			account: manyTransactionsAccount,
			owner: user.id,
			date: now,
			description: `Transaction ${index}`,
			value: 100
		});
	}
	await seedTransaction({
		account: fewTransactionsAccount,
		owner: user.id,
		date: now,
		description: 'Single transaction',
		value: 50
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Balance Account' })).toBeVisible();

	const rows = page.locator('tbody tr');

	// Balance defaults descending, then toggles ascending and descending with its indicator.
	await expect(page.getByRole('row', { name: 'Test Account' })).toBeVisible();
	expect(await getRowIndex(rows, 'High Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Mid Balance Account')
	);
	expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Low Balance Account')
	);
	const balanceButton = page.getByRole('button', { name: 'Balance' });
	const balanceHeader = balanceButton.locator('xpath=..');
	await expect(balanceHeader).toHaveAttribute('aria-sort', 'descending');

	await balanceButton.click();
	await expect(page).toHaveURL(/sort=balance/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(balanceHeader).toHaveAttribute('aria-sort', 'ascending');
	expect(await getRowIndex(rows, 'Low Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Mid Balance Account')
	);
	expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'High Balance Account')
	);

	await balanceButton.click();
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'High Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Mid Balance Account')
	);
	expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Low Balance Account')
	);

	// Account sorts alphabetically in both directions and persists after reload.
	await expect(page.getByRole('row', { name: 'Zebra Account' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Account One' })).toBeVisible();
	const accountButton = page.getByRole('button', { name: 'Account', exact: true });
	const accountHeader = accountButton.locator('xpath=..');
	await accountButton.click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(accountHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(balanceHeader).not.toHaveAttribute('aria-sort');
	expect(await getRowIndex(rows, 'Zebra Account')).toBeLessThan(
		await getRowIndex(rows, 'Alpha Account')
	);

	await accountButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Alpha Account')).toBeLessThan(
		await getRowIndex(rows, 'Zebra Account')
	);

	await page.reload();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(page.getByRole('row', { name: 'Account One' })).toBeVisible();
	expect(await getRowIndex(rows, 'Account One')).toBeLessThan(
		await getRowIndex(rows, 'Account Two')
	);

	// Account sorting survives a filter-tab change.
	await expect(page.getByRole('row', { name: 'Open Account' })).toBeVisible();
	await page.getByRole('tab', { name: 'All' }).click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Closed Account')).toBeLessThan(
		await getRowIndex(rows, 'Open Account')
	);

	// Institution records both descending and ascending state.
	await expect(page.getByRole('row', { name: 'Chase Checking' })).toBeVisible();
	const institutionHeader = page.getByRole('button', { name: 'Institution' });
	await institutionHeader.click();
	await expect(page).toHaveURL(/sort=institution/);
	await expect(page).toHaveURL(/dir=desc/);
	await institutionHeader.click();
	await expect(page).toHaveURL(/dir=asc/);

	// Transactions sorts the populated accounts by count in both directions.
	await expect(page.getByRole('row', { name: 'Many Transactions' })).toBeVisible();
	const transactionsHeader = page.getByRole('button', { name: 'Transactions' });
	await transactionsHeader.click();
	await expect(page).toHaveURL(/sort=transactions/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Many Transactions')).toBeLessThan(
		await getRowIndex(rows, 'Few Transactions')
	);

	await transactionsHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Few Transactions')).toBeLessThan(
		await getRowIndex(rows, 'Many Transactions')
	);
});
