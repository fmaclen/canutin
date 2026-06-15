import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { addMonths, endOfMonth, format, setHours, startOfMonth, subHours } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AccountSharesAccessRoleOptions,
	AccountSharesPerspectiveOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedAccountShare, seedTransaction, seedUser } from './pocketbase.helpers';

type PeriodSeed = {
	monthsAgo: number;
	income: number;
	expenses: number;
};

function getMonthStart(monthsAgo: number) {
	const now = new UTCDate();
	const startOfThisMonth = startOfMonth(now);
	return addMonths(startOfThisMonth, -monthsAgo);
}

// Using the 1st at 01:00 UTC tests boundary conditions where timezone bugs could shift transactions
function isoFirstOfMonth(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const first = new UTCDate(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 1, 0, 0, 0);
	return first.toISOString();
}

function isoEndOfMonth(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const monthEnd = endOfMonth(monthStart);
	const atNight = setHours(monthEnd, 23);
	return atNight.toISOString();
}

function isoStartOfMonth(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const atMorning = setHours(monthStart, 1);
	return atMorning.toISOString();
}

function isoOneHourBeforeMonthEnd(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const monthEnd = endOfMonth(monthStart);
	const endOfDayUtc = new UTCDate(
		monthEnd.getUTCFullYear(),
		monthEnd.getUTCMonth(),
		monthEnd.getUTCDate(),
		23,
		59,
		59,
		999
	);
	return subHours(endOfDayUtc, 1).toISOString();
}

function getExpectedPeriodLabel(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	return format(monthStart, 'MMMM yyyy');
}

test.describe('big picture cashflow chart', () => {
	test.skip(({ isMobile }) => isMobile, 'Cashflow chart interactions are desktop-only');

	test('displays correct data for all 13 periods with boundary transactions', async ({
		browser
	}) => {
		// Argentina timezone (UTC-3) catches bugs where dates shift to adjacent months
		const context = await browser.newContext({
			timezoneId: 'America/Argentina/Buenos_Aires',
			locale: 'en-US'
		});
		const page = await context.newPage();

		const user = await seedUser('zara');

		const account = await seedAccount({
			name: 'Comprehensive Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking',
			autoCalculated: new Date().toISOString()
		});

		const periodSeeds: PeriodSeed[] = [
			{ monthsAgo: 0, income: 1000, expenses: -400 }, // Current month: surplus +600
			{ monthsAgo: 1, income: 500, expenses: -800 }, // 1 month ago: deficit -300
			{ monthsAgo: 2, income: 1200, expenses: -300 }, // 2 months ago: surplus +900
			{ monthsAgo: 3, income: 400, expenses: -1100 }, // 3 months ago: deficit -700 (+ boundary)
			{ monthsAgo: 4, income: 1400, expenses: -500 }, // 4 months ago: surplus +900
			{ monthsAgo: 5, income: 300, expenses: -1500 }, // 5 months ago: deficit -1200 (lowest)
			{ monthsAgo: 6, income: 1600, expenses: -200 }, // 6 months ago: surplus +1400 (+ boundary)
			{ monthsAgo: 7, income: 600, expenses: -900 }, // 7 months ago: deficit -300
			{ monthsAgo: 8, income: 1800, expenses: -100 }, // 8 months ago: surplus +1700 (highest)
			{ monthsAgo: 9, income: 700, expenses: -1000 }, // 9 months ago: deficit -300 (+ boundary)
			{ monthsAgo: 10, income: 1100, expenses: -600 }, // 10 months ago: surplus +500
			{ monthsAgo: 11, income: 200, expenses: -700 }, // 11 months ago: deficit -500
			{ monthsAgo: 12, income: 900, expenses: -400 } // 12 months ago: surplus +500
		];

		for (const seed of periodSeeds) {
			await seedTransaction({
				account: account.id,
				owner: user.id,
				date: isoFirstOfMonth(seed.monthsAgo),
				description: `Income ${seed.monthsAgo}m ago`,
				value: seed.income
			});

			await seedTransaction({
				account: account.id,
				owner: user.id,
				date: isoFirstOfMonth(seed.monthsAgo),
				description: `Expense ${seed.monthsAgo}m ago`,
				value: seed.expenses
			});
		}

		// Boundary transactions - should be included in their respective months
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoEndOfMonth(3),
			description: 'End of month 3m ago',
			value: 50
		});

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoStartOfMonth(6),
			description: 'Start of month 6m ago',
			value: 75
		});

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoOneHourBeforeMonthEnd(9),
			description: 'One hour before end of month 9m ago',
			value: 25
		});

		// Out-of-range transactions (should NOT appear)
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(13),
			description: 'Transaction 13m ago',
			value: 9999
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(14),
			description: 'Transaction 14m ago',
			value: 8888
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(1),
			description: 'Excluded transaction',
			value: 7777,
			excluded: new Date().toISOString()
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(-1),
			description: 'Future transaction',
			value: 6666
		});

		await page.goto('/');
		await signIn(page, user.email);

		// Expected surplus: income + expenses (boundary txs added to months 3, 6, 9)
		const expectedSurplus = [
			600, -300, 900, -650, 900, -1200, 1475, -300, 1700, -275, 500, -500, 500
		];

		function formatSurplus(value: number) {
			const absValue = Math.abs(value).toLocaleString('en-US');
			return value >= 0 ? `$${absValue}` : `-$${absValue}`;
		}

		for (let monthsAgo = 12; monthsAgo >= 0; monthsAgo--) {
			const periodLabel = getExpectedPeriodLabel(monthsAgo);
			const surplus = formatSurplus(expectedSurplus[monthsAgo]);

			// aria-label format: "{periodLabel}: {surplus}"
			const ariaLabel = `${periodLabel}: ${surplus}`;
			await page.getByRole('link', { name: ariaLabel }).hover();
			await expect(page.getByRole('link', { name: ariaLabel })).toBeVisible();
		}

		await expect(page.getByText('$9,999')).not.toBeVisible();
		await expect(page.getByText('$8,888')).not.toBeVisible();
		await expect(page.getByText('$7,777')).not.toBeVisible();
		await expect(page.getByText('$6,666')).not.toBeVisible();
	});
});

test('clicking cashflow chart bar navigates to transactions filtered by that month', async ({
	page
}) => {
	const elena = await seedUser('elena');

	const account = await seedAccount({
		name: 'Cashflow Link Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: elena.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});

	// Seed transactions in a specific month (2 months ago to ensure it's in the chart)
	const now = new UTCDate();
	const targetMonth = addMonths(startOfMonth(now), -2);
	const targetMonthLabel = format(targetMonth, 'MMMM yyyy');

	await seedTransaction({
		account: account.id,
		owner: elena.id,
		date: new UTCDate(
			targetMonth.getUTCFullYear(),
			targetMonth.getUTCMonth(),
			10,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Target Month Income',
		value: 1500
	});
	await seedTransaction({
		account: account.id,
		owner: elena.id,
		date: new UTCDate(
			targetMonth.getUTCFullYear(),
			targetMonth.getUTCMonth(),
			15,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Target Month Expense',
		value: -500
	});

	// Seed a transaction in the current month (should NOT be visible after filtering)
	await seedTransaction({
		account: account.id,
		owner: elena.id,
		date: new UTCDate(now.getUTCFullYear(), now.getUTCMonth(), 5, 12, 0, 0, 0).toISOString(),
		description: 'Current Month Transaction',
		value: 200
	});

	await page.goto('/');
	await signIn(page, elena.email);

	// Click on the target month's bar in the cashflow chart
	// The bar has aria-label "{periodLabel}: {surplus}" format
	const expectedSurplus = '$1,000'; // 1500 - 500 = 1000
	const ariaLabel = `${targetMonthLabel}: ${expectedSurplus}`;
	await page.getByRole('link', { name: ariaLabel }).click();

	// Should navigate to transactions page with custom date range params
	await expect(page).toHaveURL(/\/transactions/);
	await expect(page).toHaveURL(/periodFrom=/);
	await expect(page).toHaveURL(/periodTo=/);

	// Period filter should show the month label
	await expect(page.getByLabel('Period')).toContainText(targetMonthLabel);

	// Only transactions from the target month should be visible
	await expect(page.getByText('Target Month Income')).toBeVisible();
	await expect(page.getByText('Target Month Expense')).toBeVisible();
	await expect(page.getByText('Current Month Transaction')).not.toBeVisible();

	// Switch to a preset period - custom URL params should be cleared
	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Lifetime' }).click();

	await expect(page).toHaveURL(/period=lifetime/);
	await expect(page).not.toHaveURL(/periodFrom=/);
	await expect(page).not.toHaveURL(/periodTo=/);
	await expect(page).not.toHaveURL(/periodLabel=/);

	// All transactions should now be visible
	await expect(page.getByText('Target Month Income')).toBeVisible();
	await expect(page.getByText('Target Month Expense')).toBeVisible();
	await expect(page.getByText('Current Month Transaction')).toBeVisible();
});

test('recipient sees inverse shared account cashflow in projected income and expense buckets', async ({
	page
}) => {
	const marisol = await seedUser('marisol');
	const quentin = await seedUser('quentin');

	const sharedAccount = await seedAccount({
		name: 'Shared reimbursement ledger',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: marisol.id,
		balanceType: 'Shared cashflow',
		autoCalculated: new Date().toISOString()
	});

	await seedTransaction({
		account: sharedAccount.id,
		owner: marisol.id,
		date: isoFirstOfMonth(0),
		description: 'Recipient-side income',
		value: -1200
	});
	await seedTransaction({
		account: sharedAccount.id,
		owner: marisol.id,
		date: isoFirstOfMonth(0),
		description: 'Recipient-side expense',
		value: 600
	});
	await seedAccountShare({
		account: sharedAccount.id,
		recipient: quentin.id,
		recipientEmail: quentin.email,
		grantedBy: marisol.id,
		accessRole: AccountSharesAccessRoleOptions.VIEWER,
		perspective: AccountSharesPerspectiveOptions.INVERSE,
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, quentin.email);

	await expect(page.getByRole('region', { name: 'Income per month' })).toContainText('$200');
	await expect(page.getByRole('region', { name: 'Expenses per month' })).toContainText('$100');
	await expect(page.getByRole('region', { name: 'Surplus per month' })).toContainText('$100');
});
