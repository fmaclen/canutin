import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { endOfMonth, setHours, startOfMonth, subDays, subMonths } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedTransactionLabel,
	seedUser
} from './pocketbase.helpers';

test('transactions are sorted by date DESC, then amount DESC, then id ASC', async ({ page }) => {
	const user = await seedUser('jordan');

	const account = await seedAccount({
		name: 'Sort Test Account',
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

	const now = new UTCDate();
	const date1 = setHours(subDays(now, 1), 12);
	const date2 = setHours(subDays(now, 5), 12);
	const date3 = setHours(subDays(now, 10), 12);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date1.toISOString(),
		description: 'Recent - Small',
		value: 100
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date1.toISOString(),
		description: 'Recent - Large',
		value: 500
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date2.toISOString(),
		description: 'Middle - Medium',
		value: 300
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date3.toISOString(),
		description: 'Oldest - Entry',
		value: 200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const rows = page.locator('tbody tr');
	await expect(rows).toHaveCount(4);

	const expectedOrder = ['Recent - Large', 'Recent - Small', 'Middle - Medium', 'Oldest - Entry'];

	for (let i = 0; i < expectedOrder.length; i++) {
		const row = rows.nth(i);
		await expect(row).toContainText(expectedOrder[i]!);
	}
});

test('transactions correctly handle UTC dates regardless of local timezone', async ({
	browser
}) => {
	const context = await browser.newContext({
		timezoneId: 'Pacific/Pago_Pago',
		locale: 'en-US'
	});
	const page = await context.newPage();

	const user = await seedUser('samoa');

	const account = await seedAccount({
		name: 'Island Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2000
	});

	const now = new UTCDate();
	const startOfThisMonthUtc = startOfMonth(now);
	const endOfLastMonthUtc = endOfMonth(subMonths(now, 1));

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: startOfThisMonthUtc.toISOString(),
		description: 'Early This Month UTC Transaction',
		value: 500
	});

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: endOfLastMonthUtc.toISOString(),
		description: 'Late Last Month UTC Transaction',
		value: -300
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Early This Month UTC Transaction')).toHaveCount(1);
	await expect(page.getByText('Late Last Month UTC Transaction')).toHaveCount(1);

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'This month' }).click();
	await expect(page.getByText('Early This Month UTC Transaction')).toHaveCount(1);
	await expect(page.getByText('Late Last Month UTC Transaction')).toHaveCount(0);

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Last month' }).click();
	await expect(page.getByText('Late Last Month UTC Transaction')).toHaveCount(1);
	await expect(page.getByText('Early This Month UTC Transaction')).toHaveCount(0);

	await context.close();
});

test('transactions display edge cases correctly (empty labels, no account name, excluded)', async ({
	page
}) => {
	const user = await seedUser('alex');

	const account = await seedAccount({
		name: 'Edge Case Account',
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

	const now = new UTCDate();

	// Create some transaction labels
	const groceriesLabel = await seedTransactionLabel({
		name: 'Groceries',
		owner: user.id
	});
	const personalLabel = await seedTransactionLabel({
		name: 'Personal',
		owner: user.id
	});

	// Transaction with no labels (empty array)
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'No Labels Transaction',
		value: 100
		// labels field omitted (will be empty array)
	});

	// Transaction with multiple labels
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Has Labels Transaction',
		value: 200,
		labels: [groceriesLabel.id, personalLabel.id]
	});

	// Excluded transaction
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Excluded Transaction',
		value: 300,
		excluded: new Date().toISOString()
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Verify empty labels shows "~"
	const noLabelsRow = page.getByRole('row', { name: 'No Labels Transaction' });
	await expect(noLabelsRow).toBeVisible();
	await expect(noLabelsRow.getByText('~')).toBeVisible();

	// Verify transaction with labels displays all labels as badges
	const hasLabelsRow = page.getByRole('row', { name: 'Has Labels Transaction' });
	await expect(hasLabelsRow).toBeVisible();
	await expect(hasLabelsRow.getByText('Groceries')).toBeVisible();
	await expect(hasLabelsRow.getByText('Personal')).toBeVisible();

	// Verify account name is displayed as a link
	await expect(hasLabelsRow.getByRole('link', { name: 'Edge Case Account' })).toBeVisible();

	// Click on account name link and verify navigation to account page
	await hasLabelsRow.getByRole('link', { name: 'Edge Case Account' }).click();
	await expect(page).toHaveURL(/\/accounts\//);
	// Verify we're on the account page by checking for the breadcrumb
	await expect(
		page.getByRole('listitem').getByText('Edge Case Account', { exact: true })
	).toBeVisible();

	// Navigate back to transactions to continue testing
	await goToPageViaSidebar(page, 'Transactions');

	// Verify excluded transaction has muted styling and dashed underline on amount
	const excludedRow = page.getByRole('row', { name: 'Excluded Transaction' });
	await expect(excludedRow).toBeVisible();
	await expect(excludedRow).toHaveClass(/bg-muted/);
	// Excluded amounts are wrapped in a Tooltip.Trigger (button), not a link
	const excludedAmount = excludedRow.getByText('$300.00');
	await expect(excludedAmount).toBeVisible();

	// Verify tooltip on excluded amount (only test hover on desktop)
	const info = test.info();
	const isMobile = info.project.name?.toLowerCase().includes('mobile') ?? false;
	// Hover tooltips are unavailable in mobile projects.
	if (!isMobile) {
		await excludedAmount.hover();
		// Tooltip should appear with exact exclusion message
		await expect(page.getByText('Excluded transactions do not affect reports')).toBeVisible();
	}
});

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

	// Included credits total $801.25 and debits total -$350.58.
	// The excluded $1,000 credit appears in the table but contributes nothing to net amount.
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

	// Five rows render, while only included rows produce the $450.67 net amount.
	const summaryRegion = page.getByRole('region', { name: 'Transactions summary' });
	await expect(summaryRegion.getByText('Transactions')).toBeVisible();
	await expect(summaryRegion.getByText('5', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByText('Net amount')).toBeVisible();
	await expect(summaryRegion.getByText('$450.67')).toBeVisible();

	// Both component totals are useful only while the unfiltered net combines them.
	await expect(summaryRegion.getByText('Net credits')).toBeVisible();
	await expect(summaryRegion.getByText('$801.25')).toBeVisible();
	await expect(summaryRegion.getByText('Net debits')).toBeVisible();
	await expect(summaryRegion.getByText('-$350.58')).toBeVisible();

	// Change filter to "Credits only"
	// Expected: count = 2 (excluded credits are shown only by the excluded filter), net balance = $801.25 (500.75 + 300.50)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	// Credits-only hides the redundant credit subtotal.
	await expect(summaryRegion.getByText('2', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByLabel('Net amount').getByText('$801.25')).toBeVisible();
	await expect(summaryRegion.getByText('Net credits')).not.toBeVisible();

	// Change filter to "Debits only"
	// Expected: count = 2, net balance = -$350.58 (-200.25 + -150.33)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Debits only' }).click();

	// Debits-only hides the redundant debit subtotal.
	await expect(summaryRegion.getByText('2', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByLabel('Net amount').getByText('-$350.58')).toBeVisible();
	await expect(summaryRegion.getByText('Net debits')).not.toBeVisible();

	// Change filter to "Excluded only"
	// Expected: count = 1, net balance = $0.00 (excluded transactions don't count toward net)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Excluded only' }).click();

	// Excluded-only shows one row but a zero net; neither included subtotal applies.
	await expect(summaryRegion.getByText('1', { exact: true })).toBeVisible();
	await expect(summaryRegion.getByText('$0.00')).toBeVisible();
	await expect(summaryRegion.getByText('Net credits')).not.toBeVisible();
	await expect(summaryRegion.getByText('Net debits')).not.toBeVisible();
});
