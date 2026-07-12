import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test('sorts transactions by every column and preserves sorting across reloads and filters', async ({
	page
}) => {
	const user = await seedUser('parker');
	const alphaAccount = await seedAccount({
		name: 'Alpha Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: alphaAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});
	const zetaAccount = await seedAccount({
		name: 'Zeta Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: zetaAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const now = new UTCDate();
	const oldDate = setHours(subDays(now, 30), 12);
	const midDate = setHours(subDays(now, 15), 12);
	const recentDate = setHours(subDays(now, 1), 12);
	// The dataset spans three dates, alphabetic descriptions, two accounts, positive and negative amounts, and filterable credits.
	const transactions = [
		{ account: alphaAccount.id, date: oldDate, description: 'Old Transaction', value: 100 },
		{ account: alphaAccount.id, date: midDate, description: 'Mid Transaction', value: 200 },
		{ account: alphaAccount.id, date: recentDate, description: 'Recent Transaction', value: 300 },
		{ account: alphaAccount.id, date: midDate, description: 'Zebra Store', value: 100 },
		{ account: alphaAccount.id, date: midDate, description: 'Apple Purchase', value: 200 },
		{ account: alphaAccount.id, date: midDate, description: 'Middle Shop', value: 300 },
		{ account: alphaAccount.id, date: midDate, description: 'Transaction A', value: 100 },
		{ account: zetaAccount.id, date: midDate, description: 'Transaction Z', value: 200 },
		{ account: alphaAccount.id, date: midDate, description: 'Small Credit', value: 50 },
		{ account: alphaAccount.id, date: midDate, description: 'Large Credit', value: 5000 },
		{ account: alphaAccount.id, date: midDate, description: 'Small Debit', value: -25 },
		{ account: alphaAccount.id, date: midDate, description: 'Large Debit', value: -500 },
		{ account: alphaAccount.id, date: midDate, description: 'Credit A', value: 1000 },
		{ account: alphaAccount.id, date: midDate, description: 'Credit B', value: 500 },
		{ account: alphaAccount.id, date: midDate, description: 'Debit A', value: -200 },
		{ account: alphaAccount.id, date: midDate, description: 'Test Transaction', value: 100 }
	];
	for (const transaction of transactions) {
		await seedTransaction({
			account: transaction.account,
			owner: user.id,
			date: transaction.date.toISOString(),
			description: transaction.description,
			value: transaction.value
		});
	}

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Recent Transaction' })).toBeVisible();

	const rows = page.locator('tbody tr');

	// Date defaults descending, then toggles ascending and descending.
	expect(await getRowIndex(rows, 'Recent Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Mid Transaction')
	);
	expect(await getRowIndex(rows, 'Mid Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Old Transaction')
	);
	const dateButton = page.getByRole('button', { name: 'Date' });
	await dateButton.click();
	await expect(page).toHaveURL(/sort=date/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.first()).toContainText('Old Transaction');
	expect(await getRowIndex(rows, 'Old Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Mid Transaction')
	);
	expect(await getRowIndex(rows, 'Mid Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Recent Transaction')
	);

	await dateButton.click();
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.first()).toContainText('Recent Transaction');
	expect(await getRowIndex(rows, 'Recent Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Mid Transaction')
	);

	// Description sorts alphabetically in both directions.
	await expect(page.getByRole('row', { name: 'Zebra Store' })).toBeVisible();
	const descriptionHeader = page.getByRole('button', { name: 'Description' });
	await descriptionHeader.click();
	await expect(page).toHaveURL(/sort=description/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.first()).toContainText('Zebra Store');
	expect(await getRowIndex(rows, 'Zebra Store')).toBeLessThan(
		await getRowIndex(rows, 'Apple Purchase')
	);

	await descriptionHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.first()).toContainText('Apple Purchase');
	expect(await getRowIndex(rows, 'Apple Purchase')).toBeLessThan(
		await getRowIndex(rows, 'Zebra Store')
	);

	// Account sorts by the related account name in both directions.
	await expect(page.getByRole('row', { name: 'Transaction A' })).toBeVisible();
	const accountHeader = page.locator('thead').getByRole('button', { name: 'Account' });
	await accountHeader.click();
	await expect(page).toHaveURL(/sort=account/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.first()).toContainText('Zeta Account');
	expect(await getRowIndex(rows, 'Zeta Account')).toBeLessThan(
		await getRowIndex(rows, 'Alpha Account')
	);

	await accountHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.first()).toContainText('Alpha Account');
	expect(await getRowIndex(rows, 'Alpha Account')).toBeLessThan(
		await getRowIndex(rows, 'Zeta Account')
	);

	// Amount sorts both directions, exposes its indicator, and persists after reload.
	await expect(page.getByRole('row', { name: 'Large Credit' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Test Transaction' })).toBeVisible();
	const amountButton = page.getByRole('button', { name: 'Amount' });
	const amountHeader = amountButton.locator('xpath=..');
	await amountButton.click();
	await expect(page).toHaveURL(/sort=amount/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(amountHeader).toHaveAttribute('aria-sort', 'descending');
	expect(await getRowIndex(rows, 'Large Credit')).toBeLessThan(
		await getRowIndex(rows, 'Large Debit')
	);

	await amountButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(amountHeader).toHaveAttribute('aria-sort', 'ascending');
	expect(await getRowIndex(rows, 'Large Debit')).toBeLessThan(
		await getRowIndex(rows, 'Large Credit')
	);

	await page.reload();
	await expect(page).toHaveURL(/sort=amount/);
	await expect(page).toHaveURL(/dir=asc/);

	// Moving to Date transfers the active sort indicator.
	const dateHeader = dateButton.locator('xpath=..');
	await dateButton.click();
	await expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(amountHeader).not.toHaveAttribute('aria-sort');

	// Amount sorting remains correct with the credits-only filter applied.
	await expect(page.getByRole('row', { name: 'Credit A' })).toBeVisible();
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();
	await amountButton.click();
	await expect(page).toHaveURL(/sort=amount/);
	expect(await getRowIndex(rows, 'Credit A')).toBeLessThan(await getRowIndex(rows, 'Credit B'));
});
