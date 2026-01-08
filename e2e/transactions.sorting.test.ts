import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test.describe('transactions table sorting', () => {
	test('clicking Date header sorts by date descending then ascending', async ({ page }) => {
		const user = await seedUser('parker');

		const account = await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 10000
		});

		const now = new UTCDate();
		const oldDate = setHours(subDays(now, 30), 12);
		const midDate = setHours(subDays(now, 15), 12);
		const recentDate = setHours(subDays(now, 1), 12);

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: oldDate.toISOString(),
			description: 'Old Transaction',
			value: 100
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: midDate.toISOString(),
			description: 'Mid Transaction',
			value: 200
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: recentDate.toISOString(),
			description: 'Recent Transaction',
			value: 300
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Recent Transaction' })).toBeVisible();

		const rows = page.locator('tbody tr');

		// Default sort is date DESC (most recent first)
		expect(await getRowIndex(rows, 'Recent Transaction')).toBeLessThan(
			await getRowIndex(rows, 'Mid Transaction')
		);
		expect(await getRowIndex(rows, 'Mid Transaction')).toBeLessThan(
			await getRowIndex(rows, 'Old Transaction')
		);

		// Click Date header - default is already DESC, so clicking toggles to ASC
		const dateHeader = page.getByRole('button', { name: 'Date' });
		await dateHeader.click();

		await expect(page).toHaveURL(/sort=date/);
		await expect(page).toHaveURL(/dir=asc/);

		expect(await getRowIndex(rows, 'Old Transaction')).toBeLessThan(
			await getRowIndex(rows, 'Mid Transaction')
		);
		expect(await getRowIndex(rows, 'Mid Transaction')).toBeLessThan(
			await getRowIndex(rows, 'Recent Transaction')
		);

		// Click again - should toggle back to DESC
		await dateHeader.click();
		await expect(page).toHaveURL(/dir=desc/);

		expect(await getRowIndex(rows, 'Recent Transaction')).toBeLessThan(
			await getRowIndex(rows, 'Mid Transaction')
		);
	});

	test('clicking Description header sorts alphabetically', async ({ page }) => {
		const user = await seedUser('reginald');

		const account = await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 10000
		});

		const now = new UTCDate();

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Zebra Store',
			value: 100
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Apple Purchase',
			value: 200
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Middle Shop',
			value: 300
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Zebra Store' })).toBeVisible();

		const rows = page.locator('tbody tr');

		const descriptionHeader = page.getByRole('button', { name: 'Description' });
		await descriptionHeader.click();

		await expect(page).toHaveURL(/sort=description/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex(rows, 'Zebra Store')).toBeLessThan(
			await getRowIndex(rows, 'Apple Purchase')
		);

		await descriptionHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex(rows, 'Apple Purchase')).toBeLessThan(
			await getRowIndex(rows, 'Zebra Store')
		);
	});

	test('clicking Account header sorts by account name', async ({ page }) => {
		const user = await seedUser('serena');

		const account1 = await seedAccount({
			name: 'Alpha Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account1.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 5000
		});

		const account2 = await seedAccount({
			name: 'Zeta Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Savings'
		});
		await seedAccountBalance({
			account: account2.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 5000
		});

		const now = new UTCDate();

		await seedTransaction({
			account: account1.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Transaction A',
			value: 100
		});
		await seedTransaction({
			account: account2.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Transaction Z',
			value: 200
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Transaction A' })).toBeVisible();

		const rows = page.locator('tbody tr');

		const accountHeader = page.getByRole('button', { name: 'Account' });
		await accountHeader.click();

		await expect(page).toHaveURL(/sort=account/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex(rows, 'Zeta Account')).toBeLessThan(
			await getRowIndex(rows, 'Alpha Account')
		);

		await accountHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex(rows, 'Alpha Account')).toBeLessThan(
			await getRowIndex(rows, 'Zeta Account')
		);
	});

	test('clicking Amount header sorts by amount descending then ascending', async ({ page }) => {
		const user = await seedUser('terrence');

		const account = await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 10000
		});

		const now = new UTCDate();

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Small Credit',
			value: 50
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Large Credit',
			value: 5000
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Small Debit',
			value: -25
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Large Debit',
			value: -500
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Large Credit' })).toBeVisible();

		const rows = page.locator('tbody tr');

		const amountHeader = page.getByRole('button', { name: 'Amount' });
		await amountHeader.click();

		await expect(page).toHaveURL(/sort=amount/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex(rows, 'Large Credit')).toBeLessThan(
			await getRowIndex(rows, 'Large Debit')
		);

		await amountHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex(rows, 'Large Debit')).toBeLessThan(
			await getRowIndex(rows, 'Large Credit')
		);
	});

	test('sort state persists in URL and survives page reload', async ({ page }) => {
		const user = await seedUser('ulysses');

		const account = await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 10000
		});

		const now = new UTCDate();

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Test Transaction',
			value: 100
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Test Transaction' })).toBeVisible();

		const amountHeader = page.getByRole('button', { name: 'Amount' });
		await amountHeader.click();
		await amountHeader.click();

		await expect(page).toHaveURL(/sort=amount/);
		await expect(page).toHaveURL(/dir=asc/);

		await page.reload();

		await expect(page).toHaveURL(/sort=amount/);
		await expect(page).toHaveURL(/dir=asc/);
	});

	test('sort indicator shows on active column', async ({ page }) => {
		const user = await seedUser('vernon');

		const account = await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 10000
		});

		const now = new UTCDate();

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Test Transaction',
			value: 100
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Test Transaction' })).toBeVisible();

		const amountButton = page.getByRole('button', { name: 'Amount' });
		const amountHeader = amountButton.locator('xpath=..');
		await amountButton.click();

		await expect(amountHeader).toHaveAttribute('aria-sort', 'descending');

		await amountButton.click();
		await expect(amountHeader).toHaveAttribute('aria-sort', 'ascending');

		// Click Date header - Date is default column, but we switched away, so clicking goes to DESC
		const dateButton = page.getByRole('button', { name: 'Date' });
		const dateHeader = dateButton.locator('xpath=..');
		await dateButton.click();

		await expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
		await expect(amountHeader).not.toHaveAttribute('aria-sort');
	});

	test('sorting works with filters', async ({ page }) => {
		const user = await seedUser('winston');

		const account = await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: account.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 10000
		});

		const now = new UTCDate();

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Credit A',
			value: 1000
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Credit B',
			value: 500
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: now.toISOString(),
			description: 'Debit A',
			value: -200
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');
		await expect(page.getByRole('row', { name: 'Credit A' })).toBeVisible();

		// Apply Credits only filter first
		await page.getByLabel('Type').click();
		await page.getByRole('option', { name: 'Credits only' }).click();

		// Then sort by amount DESC - sorting should work on filtered results
		const amountHeader = page.getByRole('button', { name: 'Amount' });
		await amountHeader.click();
		await expect(page).toHaveURL(/sort=amount/);

		const rows = page.locator('tbody tr');

		// With filter applied, only credits visible, sorted by amount DESC (Credit A = 1000 > Credit B = 500)
		expect(await getRowIndex(rows, 'Credit A')).toBeLessThan(await getRowIndex(rows, 'Credit B'));
	});
});
