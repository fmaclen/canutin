import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { addMonths, endOfMonth, format, setHours, startOfMonth, subHours } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedTransaction, seedUser } from './pocketbase.helpers';

// The cashflow chart displays 13 periods: current month + 12 previous months
const CASHFLOW_PERIODS = 13;

// Seed definition for a transaction in a specific period
type PeriodSeed = {
	monthsAgo: number;
	income: number;
	expenses: number;
};

// Get the start of a month N months ago (in UTC for stable comparison)
function getMonthStart(monthsAgo: number) {
	const now = new UTCDate();
	const startOfThisMonth = startOfMonth(now);
	return addMonths(startOfThisMonth, -monthsAgo);
}

// Create a date on the first of a month (1st at 01:00 UTC)
// Using the 1st tests boundary conditions where timezone bugs could shift transactions to adjacent months
function isoFirstOfMonth(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const first = new UTCDate(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 1, 0, 0, 0);
	return first.toISOString();
}

// Create a date at the very end of a month (last day, 23:00 UTC)
// This tests the boundary case where a transaction is near the end of a period
function isoEndOfMonth(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const monthEnd = endOfMonth(monthStart);
	const atNight = setHours(monthEnd, 23);
	return atNight.toISOString();
}

// Create a date at the very start of a month (1st, 01:00 UTC)
// This tests the boundary case where a transaction is near the start of a period
function isoStartOfMonth(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const atMorning = setHours(monthStart, 1);
	return atMorning.toISOString();
}

// Create a date 1 hour before a month ends
// This tests extreme boundary where a transaction could leak to the next month
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

// Get the expected month label for a period (e.g., "Jan '25" for January, "Feb" for other months)
// Uses date-fns format to match frontend formatting exactly
function getExpectedLabel(monthsAgo: number) {
	const monthStart = getMonthStart(monthsAgo);
	const isJanuary = monthStart.getMonth() === 0;
	return isJanuary ? `Jan '${format(monthStart, 'yy')}` : format(monthStart, 'MMM');
}

// Cashflow chart tests are desktop-only because:
// - Value labels are hidden on mobile (sm:block)
// - Tooltips require hover which isn't available on mobile
// - Tapping bars will eventually navigate to filtered transactions (see #285)
test.describe('big picture cashflow chart', () => {
	test.skip(({ isMobile }) => isMobile, 'Cashflow chart interactions are desktop-only');

	test('displays correct data for all 13 periods with boundary transactions', async ({ page }) => {
		const user = await seedUser('zara');

		const account = await seedAccount({
			name: 'Comprehensive Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking',
			autoCalculated: new Date().toISOString()
		});

		// Define transactions for all 13 visible periods
		// Each period has a unique income/expense combination for verification
		// Mix of positive surpluses (income > expenses) and negative surpluses (deficits)
		// Values are chosen to be easily identifiable and not overlap
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

		// Seed transactions for all 13 visible periods using mid-month dates
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

		// Seed boundary transactions to test timezone edge cases
		// These should be included in their respective months
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

		// Seed transactions OUTSIDE the visible range (should NOT appear)
		// 13 months ago is just outside the visible range
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(13),
			description: 'Transaction 13m ago - should not appear',
			value: 9999
		});

		// 14 months ago
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(14),
			description: 'Transaction 14m ago - should not appear',
			value: 8888
		});

		// Seed an excluded transaction (should NOT be counted)
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(1),
			description: 'Excluded transaction',
			value: 7777,
			excluded: new Date().toISOString()
		});

		// Seed a FUTURE transaction (next month) - should NOT appear
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(-1), // negative = future
			description: 'Future transaction - should not appear',
			value: 6666
		});

		await page.goto('/');
		await signIn(page, user.email);

		// Wait for all 13 period columns to be present
		for (let i = 0; i < CASHFLOW_PERIODS; i++) {
			const monthsAgo = CASHFLOW_PERIODS - 1 - i;
			const label = getExpectedLabel(monthsAgo);
			await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
		}

		// 1. VISIBLE VALUE LABELS (always shown without hover)
		// Current month (monthsAgo=0): 1000 - 400 = +600
		const currentMonthLabel = getExpectedLabel(0);
		await expect(page.getByRole('button', { name: `$600 ${currentMonthLabel}` })).toBeVisible();

		// Highest surplus (monthsAgo=8): 1800 - 100 = +1700
		const highestSurplusLabel = getExpectedLabel(8);
		await expect(page.getByRole('button', { name: `$1,700 ${highestSurplusLabel}` })).toBeVisible();

		// Lowest deficit (monthsAgo=5): 300 - 1500 = -1200
		const lowestDeficitLabel = getExpectedLabel(5);
		await expect(page.getByRole('button', { name: `-$1,200 ${lowestDeficitLabel}` })).toBeVisible();

		// 2. HOVER FIRST PERIOD AND CHECK FULL TOOLTIP CONTENTS
		// Month 6 has boundary transaction: base 1600 + 75 = 1675 income, -200 expenses, +1475 surplus
		const month6Label = getExpectedLabel(6);
		await page.getByRole('button', { name: month6Label }).first().hover();

		const tooltip = page.locator('[data-slot="tooltip-content"]');
		await expect(tooltip.getByText('$1,675')).toBeVisible(); // income
		await expect(tooltip.getByText('-$200')).toBeVisible(); // expenses
		await expect(tooltip.getByText('$1,475')).toBeVisible(); // surplus

		// 4. NEGATIVE ASSERTIONS - out of range, excluded, and future transactions
		await expect(page.getByText('$9,999')).not.toBeVisible(); // 13 months ago
		await expect(page.getByText('$8,888')).not.toBeVisible(); // 14 months ago
		await expect(page.getByText('$7,777')).not.toBeVisible(); // excluded
		await expect(page.getByText('$6,666')).not.toBeVisible(); // future (next month)

		// 5. REAL-TIME UPDATE - add transaction and verify chart updates
		// Month 11 currently has surplus of -500 (200 - 700)
		// Adding 2000 income should change it to +1500 (2200 - 700)
		const month11Label = getExpectedLabel(11);

		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: isoFirstOfMonth(11),
			description: 'Real-time income',
			value: 2000
		});

		// The bar button should now show the updated surplus via real-time update
		await expect(page.getByRole('button', { name: `$1,500 ${month11Label}` })).toBeVisible();
	});
});
