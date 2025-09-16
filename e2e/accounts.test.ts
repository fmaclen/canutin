import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test('accounts table reflects filters, transactions, and aggregate totals', async ({ page }) => {
	const user = await seedUser('lily');

	const openAccount = await seedAccount({
		name: 'Daily Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: openAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2500
	});
	await seedTransaction({
		account: openAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Deposit',
		value: 150
	});
	await seedTransaction({
		account: openAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Groceries',
		value: -50
	});
	await seedTransaction({
		account: openAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Reversal',
		value: 0,
		excluded: new Date().toISOString()
	});

	const excludedAccount = await seedAccount({
		name: 'Sandbox Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings',
		excluded: new Date().toISOString()
	});
	await seedAccountBalance({
		account: excludedAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	const closedAccount = await seedAccount({
		name: 'Legacy Card',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card',
		closed: new Date().toISOString()
	});
	await seedAccountBalance({
		account: closedAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: -400
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	const openRow = page.getByRole('row', { name: /Daily Checking/ });
	await expect(openRow).toBeVisible();

	const openCells = openRow.locator('td');
	await expect(openCells.nth(6)).toContainText('$2,500.00');
	await expect(openCells.nth(5)).toHaveText('3');
	await expect(openRow.getByText('Excluded')).not.toBeVisible();

	const excludedRow = page.getByRole('row', { name: /Sandbox Account/ });
	await expect(excludedRow).toBeVisible();

	const excludedCells = excludedRow.locator('td');
	await expect(excludedCells.nth(6)).toContainText('$1,000.00');
	await expect(excludedRow.getByText('Excluded')).toBeVisible();
	await expect(excludedCells.nth(5)).toHaveText('~');

	const aggregateRow = page.getByRole('row', { name: /Accounts aggregate total/ });
	await expect(aggregateRow).toContainText('$2,500.00');
	await expect(aggregateRow).not.toContainText('$1,000.00');

	await page.getByRole('tab', { name: 'All' }).click();
	await expect(page.getByRole('row', { name: /Legacy Card/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /Sandbox Account/ })).toBeVisible();
	await expect(aggregateRow).toContainText('$3,100.00');

	await page.getByRole('tab', { name: 'Closed' }).click();
	const closedRow = page.getByRole('row', { name: /Legacy Card/ });
	await expect(closedRow).toContainText('-$400');
	await expect(closedRow.getByText('Closed')).toBeVisible();
	await expect(aggregateRow).toContainText('-$400');
});
