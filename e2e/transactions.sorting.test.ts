import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test.describe('transactions table sorting', () => {
	test('clicking Date header sorts by date descending then ascending', async ({ page }) => {
		const user = await seedUser('txSortPeter');

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
		await expect(page.getByRole('row', { name: /Recent Transaction/ })).toBeVisible();

		const rows = page.locator('tbody tr');

		async function getRowIndex(name: string) {
			return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
		}

		// Default sort is date DESC (most recent first)
		expect(await getRowIndex('Recent Transaction')).toBeLessThan(
			await getRowIndex('Mid Transaction')
		);
		expect(await getRowIndex('Mid Transaction')).toBeLessThan(await getRowIndex('Old Transaction'));

		// Click Date header - default is already DESC, so clicking toggles to ASC
		const dateHeader = page.getByRole('button', { name: 'Date' });
		await dateHeader.click();

		await expect(page).toHaveURL(/sort=date/);
		await expect(page).toHaveURL(/dir=asc/);

		expect(await getRowIndex('Old Transaction')).toBeLessThan(await getRowIndex('Mid Transaction'));
		expect(await getRowIndex('Mid Transaction')).toBeLessThan(
			await getRowIndex('Recent Transaction')
		);

		// Click again - should toggle back to DESC
		await dateHeader.click();
		await expect(page).toHaveURL(/dir=desc/);

		expect(await getRowIndex('Recent Transaction')).toBeLessThan(
			await getRowIndex('Mid Transaction')
		);
	});

	test('clicking Description header sorts alphabetically', async ({ page }) => {
		const user = await seedUser('txSortRosa');

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
		await expect(page.getByRole('row', { name: /Zebra Store/ })).toBeVisible();

		const rows = page.locator('tbody tr');

		async function getRowIndex(name: string) {
			return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
		}

		const descriptionHeader = page.getByRole('button', { name: 'Description' });
		await descriptionHeader.click();

		await expect(page).toHaveURL(/sort=description/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex('Zebra Store')).toBeLessThan(await getRowIndex('Apple Purchase'));

		await descriptionHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex('Apple Purchase')).toBeLessThan(await getRowIndex('Zebra Store'));
	});

	test('clicking Account header sorts by account name', async ({ page }) => {
		const user = await seedUser('txSortSteve');

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
		await expect(page.getByRole('row', { name: /Transaction A/ })).toBeVisible();

		const rows = page.locator('tbody tr');

		async function getRowIndex(name: string) {
			return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
		}

		const accountHeader = page.getByRole('button', { name: 'Account' });
		await accountHeader.click();

		await expect(page).toHaveURL(/sort=account/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex('Zeta Account')).toBeLessThan(await getRowIndex('Alpha Account'));

		await accountHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex('Alpha Account')).toBeLessThan(await getRowIndex('Zeta Account'));
	});

	test('clicking Amount header sorts by amount descending then ascending', async ({ page }) => {
		const user = await seedUser('txSortTina');

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
		await expect(page.getByRole('row', { name: /Large Credit/ })).toBeVisible();

		const rows = page.locator('tbody tr');

		async function getRowIndex(name: string) {
			return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
		}

		const amountHeader = page.getByRole('button', { name: 'Amount' });
		await amountHeader.click();

		await expect(page).toHaveURL(/sort=amount/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex('Large Credit')).toBeLessThan(await getRowIndex('Large Debit'));

		await amountHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex('Large Debit')).toBeLessThan(await getRowIndex('Large Credit'));
	});

	test('sort state persists in URL and survives page reload', async ({ page }) => {
		const user = await seedUser('txSortUma');

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
		await expect(page.getByRole('row', { name: /Test Transaction/ })).toBeVisible();

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
		const user = await seedUser('txSortVictor');

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
		await expect(page.getByRole('row', { name: /Test Transaction/ })).toBeVisible();

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
		const user = await seedUser('txSortXavier');

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
		await expect(page.getByRole('row', { name: /Credit A/ })).toBeVisible();

		// Apply Credits only filter first
		await page.getByLabel('Type').click();
		await page.getByRole('option', { name: 'Credits only' }).click();

		// Then sort by amount DESC - sorting should work on filtered results
		const amountHeader = page.getByRole('button', { name: 'Amount' });
		await amountHeader.click();
		await expect(page).toHaveURL(/sort=amount/);

		const rows = page.locator('tbody tr');

		async function getRowIndex(name: string) {
			return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
		}

		// With filter applied, only credits visible, sorted by amount DESC (Credit A = 1000 > Credit B = 500)
		expect(await getRowIndex('Credit A')).toBeLessThan(await getRowIndex('Credit B'));
	});
});
