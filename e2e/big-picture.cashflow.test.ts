import { expect, test } from '@playwright/test';
import { addDays, format, setHours, startOfMonth, subMonths } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedTransaction, seedUser } from './pocketbase.helpers';

// Pick the 15th at local noon for stable month inclusion across timezones
function isoMidOfMonthMonthsAgo(monthsAgo: number) {
	const startThisMonth = startOfMonth(new Date());
	const targetStart = subMonths(startThisMonth, monthsAgo);
	const mid = addDays(targetStart, 14); // 15th
	const atNoon = setHours(mid, 12);
	return atNoon.toISOString();
}

// Cashflow chart tests are desktop-only because:
// - Value labels are hidden on mobile (sm:block)
// - Tooltips require hover which isn't available on mobile
// - Tapping bars will eventually navigate to filtered transactions (see #285)
test.describe('big picture cashflow chart', () => {
	test.skip(({ isMobile }) => isMobile, 'Cashflow chart interactions are desktop-only');

	test('displays bars for months with transactions', async ({ page }) => {
		const user = await seedUser('evan');

		const account = await seedAccount({
			name: 'Primary Checking',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking',
			autoCalculated: new Date().toISOString()
		});

		// Seed a positive transaction 1 month ago (surplus)
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(1),
			description: 'Salary',
			value: 5000
		});

		// Seed a negative transaction 2 months ago (deficit)
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(2),
			description: 'Big purchase',
			value: -3000
		});

		await page.goto('/');
		await signIn(page, user.email);

		// The highest surplus ($5,000) and lowest deficit (-$3,000) should show value labels
		await expect(page.getByText('$5,000')).toBeVisible();
		await expect(page.getByText('-$3,000')).toBeVisible();
	});

	test('shows tooltip with income, expenses, and surplus on hover', async ({ page }) => {
		const user = await seedUser('fiona');

		const account = await seedAccount({
			name: 'Savings Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Savings',
			autoCalculated: new Date().toISOString()
		});

		const oneMonthAgoDate = subMonths(startOfMonth(new Date()), 1);
		const expectedPeriodLabel = format(oneMonthAgoDate, 'MMMM yyyy');
		const monthLabel = format(oneMonthAgoDate, 'MMM');

		// Income transaction
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(1),
			description: 'Paycheck',
			value: 3000
		});

		// Expense transaction
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(1),
			description: 'Rent',
			value: -1500
		});

		await page.goto('/');
		await signIn(page, user.email);

		// Find and hover over the bar for the month with transactions
		const barColumn = page.getByRole('button', { name: monthLabel }).first();
		await barColumn.hover();

		// Tooltip should appear with the period label and values
		await expect(page.getByText(expectedPeriodLabel)).toBeVisible();
		await expect(page.getByText('$3,000')).toBeVisible();
		await expect(page.getByText('-$1,500')).toBeVisible();
	});

	test('updates in real-time when transactions are added', async ({ page }) => {
		const user = await seedUser('george');

		const oneMonthAgoDate = subMonths(startOfMonth(new Date()), 1);
		const monthLabel = format(oneMonthAgoDate, 'MMM');

		const account = await seedAccount({
			name: 'Daily Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking',
			autoCalculated: new Date().toISOString()
		});

		await page.goto('/');
		await signIn(page, user.email);

		// Initially no transactions, the cashflow bar button should just show the month label
		const cashflowBar = page.getByRole('button', { name: monthLabel, exact: true });
		await expect(cashflowBar).toBeVisible();

		// Add a transaction while on the page
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(1),
			description: 'Real-time income',
			value: 2000
		});

		// The bar button should now include the value label via real-time update
		await expect(page.getByRole('button', { name: '$2,000 ' + monthLabel })).toBeVisible();
	});

	test('excluded transactions are not included in cashflow calculations', async ({ page }) => {
		const user = await seedUser('hannah');

		const account = await seedAccount({
			name: 'Main Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking',
			autoCalculated: new Date().toISOString()
		});

		const oneMonthAgoDate = subMonths(startOfMonth(new Date()), 1);
		const monthLabel = format(oneMonthAgoDate, 'MMM');

		// Regular income transaction
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(1),
			description: 'Regular income',
			value: 1000
		});

		// Excluded transaction (should not be counted)
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoMidOfMonthMonthsAgo(1),
			description: 'Excluded transfer',
			value: 5000,
			excluded: new Date().toISOString()
		});

		await page.goto('/');
		await signIn(page, user.email);

		// Hover over the month to see tooltip
		const barColumn = page.getByRole('button', { name: monthLabel }).first();
		await barColumn.hover();

		// Tooltip should show $1,000 income (not $6,000 which would include excluded)
		await expect(page.getByText('$1,000').first()).toBeVisible();
		// $5,000 and $6,000 should NOT be visible anywhere
		await expect(page.getByText('$5,000')).not.toBeVisible();
		await expect(page.getByText('$6,000')).not.toBeVisible();
	});
});
