import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test('transactions page shows correct count and net balance in summary', async ({ page }) => {
	const user = await seedUser('quinn');

	const account = await seedAccount({
		name: 'Summary Test Account',
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

	// Seed 5 transactions:
	// - 2 credits: +500.75, +300.50 = +801.25
	// - 2 debits: -200.25, -150.33 = -350.58
	// - 1 excluded credit: +1000 (should not affect net balance)
	// Expected count: 5
	// Expected net balance: 500.75 + 300.50 - 200.25 - 150.33 = 450.67

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Freelance Payment',
		value: 500.75
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Refund Received',
		value: 300.5
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Grocery Shopping',
		value: -200.25
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Utility Bill',
		value: -150.33
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Excluded Transfer',
		value: 1000,
		excluded: new Date().toISOString()
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Verify all 5 transactions are visible
	await expect(page.getByText('Freelance Payment')).toBeVisible();
	await expect(page.getByText('Refund Received')).toBeVisible();
	await expect(page.getByText('Grocery Shopping')).toBeVisible();
	await expect(page.getByText('Utility Bill')).toBeVisible();
	await expect(page.getByText('Excluded Transfer')).toBeVisible();

	// Verify summary shows correct count and net balance
	const summaryRegion = page.getByRole('region', { name: 'Transactions summary' });
	await expect(summaryRegion.getByText('Transactions')).toBeVisible();
	await expect(summaryRegion.getByText('5', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByText('Net balance')).toBeVisible();
	await expect(summaryRegion.getByText('$450.67')).toBeVisible();

	// Change filter to "Credits only"
	// Expected: count = 3 (2 regular credits + 1 excluded credit), net balance = $801.25 (500.75 + 300.50)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	await expect(summaryRegion.getByText('3', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByText('$801.25')).toBeVisible();

	// Change filter to "Debits only"
	// Expected: count = 2, net balance = -$350.58 (-200.25 + -150.33)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Debits only' }).click();

	await expect(summaryRegion.getByText('2', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByText('-$350.58')).toBeVisible();

	// Change filter to "Excluded only"
	// Expected: count = 1, net balance = $0.00 (excluded transactions don't count toward net)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Excluded only' }).click();

	await expect(summaryRegion.getByText('1', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByText('$0.00')).toBeVisible();
});
