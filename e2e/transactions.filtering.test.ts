import { UTCDate } from '@date-fns/utc';
import { expect, test, type Page } from '@playwright/test';
import { addMonths, format, startOfMonth, startOfYear, subYears } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedTransactionLabel,
	seedUser
} from './pocketbase.helpers';

type PeriodOption =
	| 'this-month'
	| 'last-month'
	| 'last-3-months'
	| 'last-6-months'
	| 'last-12-months'
	| 'year-to-date'
	| 'last-year'
	| 'lifetime';

test('transactions table responds to period filters', async ({ page }) => {
	const { user, transactions, now } = await seedFilteringTransactions('taylor');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Invoice Payment' })).toBeVisible();

	await expect(page.getByLabel('Period')).toContainText('Last 3 months');
	await expect(page.getByLabel('Type')).toContainText('Any amounts');

	const periodFilters: Array<{ label: string; value: PeriodOption }> = [
		{ label: 'This month', value: 'this-month' },
		{ label: 'Last month', value: 'last-month' },
		{ label: 'Last 3 months', value: 'last-3-months' },
		{ label: 'Last 6 months', value: 'last-6-months' },
		{ label: 'Last 12 months', value: 'last-12-months' },
		{ label: 'Year to date', value: 'year-to-date' },
		{ label: 'Last year', value: 'last-year' },
		{ label: 'Lifetime', value: 'lifetime' }
	];

	for (const { label, value } of periodFilters) {
		await page.getByLabel('Period').click();
		await page.getByRole('button', { name: label }).click();
		await expect(page.getByLabel('Period')).toContainText(label);

		// After selecting, re-open popover and verify the selected preset is highlighted
		await page.getByLabel('Period').click();
		const selectedPresetButton = page.getByRole('button', { name: label, exact: true });
		await expect(selectedPresetButton).toHaveAttribute('data-selected');
		await page.keyboard.press('Escape');

		for (const txn of transactions) {
			const shouldBeVisible = isWithinPeriod(txn.date, value, now);
			await expectRowVisibility(page, txn.description, shouldBeVisible);
		}

		await page.reload();
		await expect(page.getByLabel('Period')).toContainText(label);
		if (label !== 'Last 3 months') {
			await expect(page.getByLabel('Period')).not.toContainText('Last 3 months');
		}
		for (const txn of transactions) {
			const shouldBeVisible = isWithinPeriod(txn.date, value, now);
			await expectRowVisibility(page, txn.description, shouldBeVisible);
		}
	}

	// Test that sidebar navigation resets filter to match URL state
	// Currently showing "Lifetime" from previous loop iteration
	await expect(page.getByLabel('Period')).toContainText('Lifetime');
	await goToPageViaSidebar(page, 'Transactions');
	// URL has no period param, so filter should reset to default "Last 3 months"
	await expect(page).not.toHaveURL(/period=/);
	await expect(page.getByLabel('Period')).toContainText('Last 3 months');

	const excludedRow = page.getByRole('row', { name: 'Excluded Adjustment' });
	await expect(excludedRow).toBeVisible();
	const excludedAmount = excludedRow.getByText('$75.00');
	await expect(excludedAmount).toBeVisible();

	const info = test.info();
	const isMobile = info.project.name?.toLowerCase().includes('mobile') ?? false;
	if (!isMobile) {
		await excludedAmount.hover();
	}
});

test('transactions table responds to type filters', async ({ page }) => {
	const { user, transactions } = await seedFilteringTransactions('taylor-types');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Invoice Payment' })).toBeVisible();
	await expect(page.getByLabel('Type')).toContainText('Any amounts');

	// Set period to "Lifetime" so type filter tests can check all transactions
	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Lifetime' }).click();
	await expect(page.getByLabel('Period')).toContainText('Lifetime');

	const typeFilters: Array<{
		label: string;
		predicate: (txn: { value: number; excluded: boolean }) => boolean;
	}> = [
		{ label: 'Any amounts', predicate: () => true },
		{ label: 'Credits only', predicate: (txn) => txn.value > 0 && !txn.excluded },
		{ label: 'Debits only', predicate: (txn) => txn.value < 0 && !txn.excluded },
		{ label: 'Excluded only', predicate: (txn) => txn.excluded }
	];

	for (const { label, predicate } of typeFilters) {
		await page.getByLabel('Type').click();
		await page.getByRole('option', { name: label }).click();
		await expect(page.getByLabel('Type')).toContainText(label);
		for (const txn of transactions) {
			const shouldBeVisible = predicate(txn);
			await expectRowVisibility(page, txn.description, shouldBeVisible);
		}

		await page.reload();
		await expect(page.getByLabel('Type')).toContainText(label);
		if (label !== 'Any amounts') {
			await expect(page.getByLabel('Type')).not.toContainText('Any amounts');
		}
		for (const txn of transactions) {
			const shouldBeVisible = predicate(txn);
			await expectRowVisibility(page, txn.description, shouldBeVisible);
		}
	}

	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Any amounts' }).click();
});

test('transactions pagination navigates between pages', async ({ page }) => {
	const user = await seedUser('paul');

	const account = await seedAccount({
		name: 'Primary Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const prefix = 'Pagination Batch Tx';
	const baseDate = new Date();
	const seededDescriptions: string[] = [];
	for (let i = 0; i < 55; i++) {
		const date = new Date(
			Date.UTC(
				baseDate.getUTCFullYear(),
				baseDate.getUTCMonth(),
				baseDate.getUTCDate(),
				12,
				0,
				0,
				0
			)
		);
		date.setUTCDate(date.getUTCDate() - i);
		const description = `${prefix} ${String(i + 1).padStart(3, '0')}`;
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: date.toISOString(),
			description,
			value: i % 2 === 0 ? 100 + i : -100 - i
		});
		seededDescriptions.push(description);
	}

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const rowsForBatch = page.getByRole('row', { name: prefix });
	const previousButton = page.getByRole('button', { name: 'Previous' });
	const nextButton = page.getByRole('button', { name: 'Next' });
	await expect(previousButton).toBeDisabled();
	await expect(nextButton).toBeEnabled();
	await expect(rowsForBatch).toHaveCount(50);

	const lastDescription = seededDescriptions[seededDescriptions.length - 1] ?? '';
	await expect(page.getByRole('row', { name: lastDescription })).toHaveCount(0);

	await nextButton.click();
	await expect(rowsForBatch).toHaveCount(5);
	await expect(page.getByRole('row', { name: lastDescription })).toBeVisible();
	await expect(nextButton).toBeDisabled();
	await expect(previousButton).toBeEnabled();

	await previousButton.click();
	await expect(rowsForBatch).toHaveCount(50);
	await expect(page.getByRole('row', { name: `${prefix} 010` })).toBeVisible();
	await expect(previousButton).toBeDisabled();
	await expect(nextButton).toBeEnabled();

	// Edge case: Test that page resets when filter reduces results below current page
	// Navigate to page 2, then apply a filter that leaves fewer than 50 results
	await nextButton.click();
	await expect(rowsForBatch).toHaveCount(5);

	// Apply "Credits only" filter (only even-indexed transactions, which are positive)
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	// Should have only ~28 credit transactions (every other one), all on page 1
	// Pagination footer should disappear since we're under 51 transactions
	await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);

	// Should be showing transactions now (not an empty page)
	const creditRows = page.getByRole('row', { name: prefix });
	await expect(creditRows.first()).toBeVisible();
});

test('transactions can be searched by description', async ({ page }) => {
	const user = await seedUser('grace');

	const account = await seedAccount({
		name: 'Search Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Whole Foods Grocery Store',
		value: -150
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Amazon Prime Subscription',
		value: -14.99
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Trader Joes Grocery',
		value: -85
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Netflix Monthly',
		value: -15.99
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Whole Foods Grocery Store')).toBeVisible();
	await expect(page.getByText('Amazon Prime Subscription')).toBeVisible();
	await expect(page.getByText('Trader Joes Grocery')).toBeVisible();
	await expect(page.getByText('Netflix Monthly')).toBeVisible();

	const searchInput = page.getByPlaceholder('Search transactions');
	await searchInput.fill('Grocery');

	await expect(page.getByText('Whole Foods Grocery Store')).toBeVisible();
	await expect(page.getByText('Trader Joes Grocery')).toBeVisible();
	await expect(page.getByText('Amazon Prime Subscription')).not.toBeVisible();
	await expect(page.getByText('Netflix Monthly')).not.toBeVisible();

	await searchInput.fill('Amazon');

	await expect(page.getByText('Amazon Prime Subscription')).toBeVisible();
	await expect(page.getByText('Whole Foods Grocery Store')).not.toBeVisible();
	await expect(page.getByText('Trader Joes Grocery')).not.toBeVisible();
	await expect(page.getByText('Netflix Monthly')).not.toBeVisible();

	await page.reload();

	await expect(searchInput).toHaveValue('Amazon');
	await expect(page.getByText('Amazon Prime Subscription')).toBeVisible();
	await expect(page.getByText('Whole Foods Grocery Store')).not.toBeVisible();

	await page.getByLabel('Clear search').click();

	await expect(page.getByText('Whole Foods Grocery Store')).toBeVisible();
	await expect(page.getByText('Amazon Prime Subscription')).toBeVisible();
	await expect(page.getByText('Trader Joes Grocery')).toBeVisible();
	await expect(page.getByText('Netflix Monthly')).toBeVisible();
});

test('transaction search persists in URL and combines with filters', async ({ page }) => {
	const user = await seedUser('henry');

	const account = await seedAccount({
		name: 'URL Search Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 3000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Salary Deposit',
		value: 5000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Salary Bonus',
		value: 1000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Coffee Shop',
		value: -5.5
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const searchInput = page.getByPlaceholder('Search transactions');
	await searchInput.fill('Salary');

	await expect(page.url()).toContain('q=Salary');

	await expect(page.getByText('Salary Deposit')).toBeVisible();
	await expect(page.getByText('Salary Bonus')).toBeVisible();
	await expect(page.getByText('Coffee Shop')).not.toBeVisible();

	await page.reload();

	await expect(searchInput).toHaveValue('Salary');
	await expect(page.getByText('Salary Deposit')).toBeVisible();
	await expect(page.getByText('Salary Bonus')).toBeVisible();
	await expect(page.getByText('Coffee Shop')).not.toBeVisible();

	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	await expect(page.getByText('Salary Deposit')).toBeVisible();
	await expect(page.getByText('Salary Bonus')).toBeVisible();

	await page.getByLabel('Clear search').click();

	await expect(page.getByText('Salary Deposit')).toBeVisible();
	await expect(page.getByText('Salary Bonus')).toBeVisible();
	await expect(page.getByText('Coffee Shop')).not.toBeVisible();
});

function dateForMonthOffset(baseMonth: Date, monthsOffset: number, day: number) {
	const safeDay = Math.min(day, 28);
	const targetMonth = addMonths(baseMonth, monthsOffset);
	return new UTCDate(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), safeDay, 12, 0, 0, 0);
}

async function seedFilteringTransactions(userName: string) {
	const user = await seedUser(userName);

	const account = await seedAccount({
		name: 'Everyday Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1200
	});

	const now = new UTCDate();
	const startOfThisMonth = startOfMonth(now);
	const seedDefinitions: Array<{
		description: string;
		value: number;
		monthsOffset: number;
		day?: number;
		excluded?: boolean;
	}> = [
		{ description: 'Invoice Payment', value: 650, monthsOffset: 0, day: 6 },
		{ description: 'Groceries Order', value: -120, monthsOffset: 0, day: 8 },
		{ description: 'Last Month Rent', value: -900, monthsOffset: -1, day: 9 },
		{ description: 'Consulting Fee', value: 800, monthsOffset: -2, day: 10 },
		{ description: 'Insurance Premium', value: -400, monthsOffset: -4, day: 12 },
		{ description: 'Bonus Payout', value: 1200, monthsOffset: -8, day: 14 },
		{ description: 'Holiday Flight', value: -500, monthsOffset: -13, day: 16 },
		{ description: 'Vintage Sale', value: 350, monthsOffset: -18, day: 18 },
		{ description: 'Excluded Adjustment', value: 75, monthsOffset: 0, day: 20, excluded: true },
		{ description: 'Excluded Fee', value: -45, monthsOffset: 0, day: 21, excluded: true }
	];

	const transactions = [] as Array<{
		description: string;
		value: number;
		date: Date;
		excluded: boolean;
	}>;

	for (const entry of seedDefinitions) {
		const date = dateForMonthOffset(startOfThisMonth, entry.monthsOffset, entry.day ?? 15);
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: date.toISOString(),
			description: entry.description,
			value: entry.value,
			excluded: entry.excluded ? new Date().toISOString() : undefined
		});
		transactions.push({
			description: entry.description,
			value: entry.value,
			date,
			excluded: Boolean(entry.excluded)
		});
	}

	return { user, transactions, now };
}

function getPeriodRange(option: PeriodOption, reference: Date) {
	const startOfThisMonth = startOfMonth(reference);
	switch (option) {
		case 'this-month':
			return { from: startOfThisMonth, to: null } as const;
		case 'last-month':
			return { from: addMonths(startOfThisMonth, -1), to: startOfThisMonth } as const;
		case 'last-3-months':
			return { from: addMonths(startOfThisMonth, -2), to: null } as const;
		case 'last-6-months':
			return { from: addMonths(startOfThisMonth, -5), to: null } as const;
		case 'last-12-months':
			return { from: addMonths(startOfThisMonth, -11), to: null } as const;
		case 'year-to-date':
			return { from: startOfMonth(new UTCDate(reference.getUTCFullYear(), 0)), to: null } as const;
		case 'last-year': {
			const yearStart = startOfMonth(new UTCDate(reference.getUTCFullYear(), 0));
			const lastYearStart = addMonths(yearStart, -12);
			return { from: lastYearStart, to: yearStart } as const;
		}
		case 'lifetime':
		default:
			return { from: null, to: null } as const;
	}
}

function isWithinPeriod(date: Date, option: PeriodOption, reference: Date) {
	const { from, to } = getPeriodRange(option, reference);
	const time = date.getTime();
	if (from && time < from.getTime()) return false;
	if (to && time >= to.getTime()) return false;
	return true;
}

async function expectRowVisibility(page: Page, description: string, shouldBeVisible: boolean) {
	const row = page.getByRole('row', { name: description });
	if (shouldBeVisible) {
		await expect(row).toHaveCount(1);
		await expect(row).toBeVisible();
	} else {
		await expect(row).toHaveCount(0);
	}
}

// Regression test for https://github.com/fmaclen/canutin/issues/289
// PocketBase stores dates with space separator but JS toISOString() uses 'T'.
// This causes string comparison failures at period boundaries.
test('"Last year" filter correctly handles period boundaries', async ({ page }) => {
	const user = await seedUser('ivy');

	const account = await seedAccount({
		name: 'Date Filter Test Account',
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

	// Calculate dates relative to now for time-independent testing
	// "Last year" filter range: [Jan 1 of lastYear 00:00:00, Jan 1 of thisYear 00:00:00)
	// NOTE: This test could theoretically fail if run exactly at midnight on Dec 31st,
	// as the test's "thisYear" and the backend's "thisYear" could differ by one year.
	const now = new UTCDate();
	const thisYearStart = startOfYear(now);
	const lastYearStart = startOfYear(subYears(now, 1));

	// BOUNDARY: 1 second BEFORE period start - should NOT be visible
	const beforePeriod = new UTCDate(lastYearStart.getTime() - 1000);
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: beforePeriod.toISOString(),
		description: 'Before Period Boundary',
		value: 100
	});

	// BOUNDARY: Exactly at period start (Jan 1 00:00:00.000Z) - should be visible
	// This is the edge case most likely to fail due to T vs space comparison
	const atPeriodStart = new UTCDate(lastYearStart.getTime());
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: atPeriodStart.toISOString(),
		description: 'At Period Start Boundary',
		value: 200
	});

	// INSIDE: Mid-year transaction - should be visible
	const midYear = new UTCDate(lastYearStart.getUTCFullYear(), 6, 15, 12, 0, 0, 0);
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: midYear.toISOString(),
		description: 'Mid Year Payment',
		value: 300
	});

	// BOUNDARY: 1 second BEFORE period end - should be visible
	const beforePeriodEnd = new UTCDate(thisYearStart.getTime() - 1000);
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: beforePeriodEnd.toISOString(),
		description: 'Before Period End Boundary',
		value: 400
	});

	// BOUNDARY: Exactly at period end (Jan 1 of this year) - should NOT be visible (exclusive)
	const atPeriodEnd = new UTCDate(thisYearStart.getTime());
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: atPeriodEnd.toISOString(),
		description: 'At Period End Boundary',
		value: 500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Apply "Last year" filter
	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Last year' }).click();
	await expect(page.getByLabel('Period')).toContainText('Last year');

	// Transactions OUTSIDE the period
	await expect(page.getByText('Before Period Boundary')).not.toBeVisible();
	await expect(page.getByText('At Period End Boundary')).not.toBeVisible();

	// Transactions INSIDE the period (inclusive start, exclusive end)
	await expect(page.getByText('At Period Start Boundary')).toBeVisible();
	await expect(page.getByText('Mid Year Payment')).toBeVisible();
	await expect(page.getByText('Before Period End Boundary')).toBeVisible();
});

test('custom date range with periodLabel from URL displays the label and calendar shows selection', async ({
	page
}) => {
	const user = await seedUser('riley');

	const account = await seedAccount({
		name: 'Period Label Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	// Use dynamic dates relative to now
	const now = new UTCDate();
	const thisMonth = startOfMonth(now);
	const lastMonth = addMonths(thisMonth, -1);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			lastMonth.getUTCFullYear(),
			lastMonth.getUTCMonth(),
			15,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Last Month Salary',
		value: 5000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			thisMonth.getUTCFullYear(),
			thisMonth.getUTCMonth(),
			15,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'This Month Salary',
		value: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);

	// Build dynamic URL params for last month
	const fromDate = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	const toDate = `${thisMonth.getUTCFullYear()}-${String(thisMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	const monthLabel = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

	// Navigate with periodLabel param (as would be set by cashflow chart link)
	await page.goto(
		`/transactions?periodFrom=${fromDate}&periodTo=${toDate}&periodLabel=${encodeURIComponent(monthLabel)}`
	);

	// Period trigger should show the custom label from URL
	await expect(page.getByLabel('Period')).toContainText(monthLabel);

	// Only last month's transaction should be visible
	await expect(page.getByText('Last Month Salary')).toBeVisible();
	await expect(page.getByText('This Month Salary')).not.toBeVisible();

	// Open the period picker - calendar should show the selected date range
	await page.getByLabel('Period').click();

	// The selected date range should be visually highlighted on the calendar
	// Calendar button aria-labels use format "Friday, March 1, 2024"
	// Day 1 should be the start of selection (has data-selected attribute)
	// Use .first() because 2-month calendar may show same date in adjacent months
	const monthName = format(lastMonth, 'MMMM');
	const day1Button = page.getByRole('button', { name: new RegExp(`${monthName} 1,`) }).first();
	await expect(day1Button).toBeVisible();
	await expect(day1Button).toHaveAttribute('data-selected');
});

test('date range picker allows selecting custom range via calendar', async ({ page }) => {
	const user = await seedUser('skyler');

	const account = await seedAccount({
		name: 'Calendar Picker Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	// Seed transactions across several months
	const now = new UTCDate();
	const thisMonth = startOfMonth(now);
	const lastMonth = addMonths(thisMonth, -1);
	const twoMonthsAgo = addMonths(thisMonth, -2);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			twoMonthsAgo.getUTCFullYear(),
			twoMonthsAgo.getUTCMonth(),
			10,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Two Months Ago Payment',
		value: 100
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			lastMonth.getUTCFullYear(),
			lastMonth.getUTCMonth(),
			15,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Last Month Payment',
		value: 200
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			thisMonth.getUTCFullYear(),
			thisMonth.getUTCMonth(),
			5,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'This Month Payment',
		value: 300
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Open the period picker popover
	await page.getByLabel('Period').click();

	// The popover should show both presets and a calendar
	await expect(page.getByRole('button', { name: 'Last month' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'This month' })).toBeVisible();

	// Navigate to last month to select a date range
	await page.getByRole('button', { name: 'Previous' }).click();

	// Select a custom date range using the calendar
	// The calendar shows 2 months side-by-side, use .first() to select from the left month
	// Click on day 10 of last month (start of range)
	await page.getByRole('button', { name: /10,/ }).first().click();
	// Click on day 20 of last month (end of range)
	await page.getByRole('button', { name: /20,/ }).first().click();

	// URL should be updated with periodFrom and periodTo
	await expect(page).toHaveURL(/periodFrom=/);
	await expect(page).toHaveURL(/periodTo=/);

	// Transactions should be filtered to the selected range
	await expect(page.getByText('Last Month Payment')).toBeVisible();
	await expect(page.getByText('Two Months Ago Payment')).not.toBeVisible();
	await expect(page.getByText('This Month Payment')).not.toBeVisible();
});

test('switching from custom range back to preset clears custom URL params and updates transactions', async ({
	page
}) => {
	const user = await seedUser('jordan');

	const account = await seedAccount({
		name: 'Preset Switch Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const now = new UTCDate();
	const thisMonth = startOfMonth(now);
	const lastMonth = addMonths(thisMonth, -1);
	const twoMonthsAgo = addMonths(thisMonth, -2);

	// Transaction this month
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			thisMonth.getUTCFullYear(),
			thisMonth.getUTCMonth(),
			5,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'This Month Transaction',
		value: 500
	});

	// Transaction last month
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			lastMonth.getUTCFullYear(),
			lastMonth.getUTCMonth(),
			15,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Last Month Transaction',
		value: 200
	});

	// Transaction two months ago
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(
			twoMonthsAgo.getUTCFullYear(),
			twoMonthsAgo.getUTCMonth(),
			20,
			12,
			0,
			0,
			0
		).toISOString(),
		description: 'Two Months Ago Transaction',
		value: 300
	});

	await page.goto('/');
	await signIn(page, user.email);

	// Start with custom date range in URL (last month only)
	const fromDate = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	const toDate = `${thisMonth.getUTCFullYear()}-${String(thisMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	await page.goto(`/transactions?periodFrom=${fromDate}&periodTo=${toDate}`);

	// Only last month's transaction should be visible initially
	await expect(page.getByText('Last Month Transaction')).toBeVisible();
	await expect(page.getByText('This Month Transaction')).not.toBeVisible();
	await expect(page.getByText('Two Months Ago Transaction')).not.toBeVisible();

	// Open period picker and select "Last 3 months" preset
	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Last 3 months' }).click();

	// URL should now have period=last-3-months, not periodFrom/periodTo
	await expect(page).toHaveURL(/period=last-3-months/);
	await expect(page).not.toHaveURL(/periodFrom=/);
	await expect(page).not.toHaveURL(/periodTo=/);
	await expect(page).not.toHaveURL(/periodLabel=/);

	// Period trigger should show preset label
	await expect(page.getByLabel('Period')).toContainText('Last 3 months');

	// All 3 transactions should now be visible (they're all within last 3 months)
	await expect(page.getByText('This Month Transaction')).toBeVisible();
	await expect(page.getByText('Last Month Transaction')).toBeVisible();
	await expect(page.getByText('Two Months Ago Transaction')).toBeVisible();
});

test('invalid date range params fall back to default period', async ({ page }) => {
	const user = await seedUser('alex');

	const account = await seedAccount({
		name: 'Invalid Params Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Current Transaction',
		value: 100
	});

	await page.goto('/');
	await signIn(page, user.email);

	// Test with invalid date format
	await page.goto('/transactions?periodFrom=invalid-date&periodTo=2024-01-31');

	// Should fall back to default period (Last 3 months) or show error
	// The page should not crash and should show the default view
	await expect(page.getByLabel('Period')).toBeVisible();
	await expect(page.getByLabel('Period')).toContainText('Last 3 months');

	// Test with end date before start date
	await page.goto('/transactions?periodFrom=2024-03-01&periodTo=2024-01-01');

	// Should fall back to default or show error message
	await expect(page.getByLabel('Period')).toBeVisible();
	// Either shows error message or falls back to default
	const hasError = await page
		.getByText(/invalid|error/i)
		.isVisible()
		.catch(() => false);
	if (!hasError) {
		// If no error shown, should fall back to default
		await expect(page.getByLabel('Period')).toContainText('Last 3 months');
	}
});

test('transactions can be filtered by account', async ({ page }) => {
	const user = await seedUser('morgan');

	const checkingAccount = await seedAccount({
		name: 'Everyday Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const creditAccount = await seedAccount({
		name: 'Rewards Credit Card',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card'
	});
	await seedAccountBalance({
		account: creditAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: -1500
	});

	const now = new UTCDate();

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Paycheck Direct Deposit',
		value: 3500
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'ATM Withdrawal',
		value: -200
	});
	await seedTransaction({
		account: creditAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Restaurant Dinner',
		value: -85
	});
	await seedTransaction({
		account: creditAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Online Shopping',
		value: -150
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// All transactions should be visible initially
	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).toBeVisible();
	await expect(page.getByText('Online Shopping')).toBeVisible();

	// Account filter should show "All accounts" by default
	await expect(page.getByLabel('Account', { exact: true })).toContainText('All accounts');

	// Open the account filter dropdown
	await page.getByLabel('Account', { exact: true }).click();

	// Dropdown should show accounts grouped by balance type with colored indicators
	await expect(page.getByText('Cash')).toBeVisible();
	await expect(page.getByText('Debt')).toBeVisible();
	await expect(page.getByRole('option', { name: 'Everyday Checking' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Rewards Credit Card' })).toBeVisible();

	// Select the checking account
	await page.getByRole('option', { name: 'Everyday Checking' }).click();

	// Only checking account transactions should be visible
	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).not.toBeVisible();
	await expect(page.getByText('Online Shopping')).not.toBeVisible();

	// Filter trigger should show the selected account name
	await expect(page.getByLabel('Account', { exact: true })).toContainText('Everyday Checking');

	// URL should contain account parameter
	await expect(page).toHaveURL(/account=/);

	// Reload and verify filter persists
	await page.reload();
	await expect(page.getByLabel('Account', { exact: true })).toContainText('Everyday Checking');
	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).not.toBeVisible();

	// Switch to credit card account
	await page.getByLabel('Account', { exact: true }).click();
	await page.getByRole('option', { name: 'Rewards Credit Card' }).click();

	// Only credit card transactions should be visible
	await expect(page.getByText('Restaurant Dinner')).toBeVisible();
	await expect(page.getByText('Online Shopping')).toBeVisible();
	await expect(page.getByText('Paycheck Direct Deposit')).not.toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).not.toBeVisible();

	// Clear the filter using the X button
	await page.getByLabel('Clear account filter').click();

	// All transactions should be visible again
	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).toBeVisible();
	await expect(page.getByText('Online Shopping')).toBeVisible();

	// URL should no longer contain account parameter
	await expect(page).not.toHaveURL(/account=/);
});

test('transactions can be filtered by label', async ({ page }) => {
	const user = await seedUser('nora');

	const account = await seedAccount({
		name: 'Household Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2500
	});

	const groceriesLabel = await seedTransactionLabel({ name: 'Groceries', owner: user.id });
	const utilitiesLabel = await seedTransactionLabel({ name: 'Utilities', owner: user.id });
	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Farm Stand Produce',
		value: -42,
		labels: [groceriesLabel.id]
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Electric Company Bill',
		value: -118,
		labels: [utilitiesLabel.id]
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Unlabeled Cash Withdrawal',
		value: -80
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).toBeVisible();
	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');

	await page.getByLabel('Label', { exact: true }).click();
	await expect(page.getByRole('option', { name: 'Groceries' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Utilities' })).toBeVisible();
	await page.getByRole('option', { name: 'Groceries' }).click();

	await expect(page.getByLabel('Label', { exact: true })).toContainText('Groceries');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).not.toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).not.toBeVisible();
	await expect(page).toHaveURL(/label=/);

	await page.getByRole('link', { name: 'Farm Stand Produce' }).click();
	await expect(page).toHaveURL(/\/transactions\//);

	await page.goBack();
	await expect(page.getByLabel('Label', { exact: true })).toContainText('Groceries');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).not.toBeVisible();
	await expect(page).toHaveURL(/label=/);

	await page.reload();
	await expect(page.getByLabel('Label', { exact: true })).toContainText('Groceries');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).not.toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).not.toBeVisible();

	await page.getByLabel('Clear label filter').click();

	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).toBeVisible();
	await expect(page).not.toHaveURL(/label=/);

	await page.getByRole('link', { name: 'Farm Stand Produce' }).click();
	await expect(page).toHaveURL(/\/transactions\//);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated').first()).toBeVisible();
	await expect(page).toHaveURL('/transactions');
	await expect(page).not.toHaveURL(/label=/);
	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
});

test('account filter works with other filters combined', async ({ page }) => {
	const user = await seedUser('casey');

	const savingsAccount = await seedAccount({
		name: 'High Yield Savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: savingsAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const brokerageAccount = await seedAccount({
		name: 'Investment Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: brokerageAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 25000
	});

	const now = new UTCDate();

	// Savings account: one credit, one debit
	await seedTransaction({
		account: savingsAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Interest Payment',
		value: 50
	});
	await seedTransaction({
		account: savingsAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Transfer to Checking',
		value: -500
	});

	// Brokerage account: one credit, one debit
	await seedTransaction({
		account: brokerageAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Dividend Income',
		value: 125
	});
	await seedTransaction({
		account: brokerageAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Stock Purchase',
		value: -1000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Filter by savings account
	await page.getByLabel('Account', { exact: true }).click();
	await page.getByRole('option', { name: 'High Yield Savings' }).click();

	// Both savings transactions visible
	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).toBeVisible();
	await expect(page.getByText('Dividend Income')).not.toBeVisible();
	await expect(page.getByText('Stock Purchase')).not.toBeVisible();

	// Add type filter for credits only
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	// Only savings credit should be visible
	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).not.toBeVisible();
	await expect(page.getByText('Dividend Income')).not.toBeVisible();
	await expect(page.getByText('Stock Purchase')).not.toBeVisible();

	// Test that realtime updates respect BOTH filters (account + kind).
	// Seed two transactions: one that matches both filters, one that only matches kind.
	await seedTransaction({
		account: brokerageAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Realtime Brokerage Dividend',
		value: 75
	});
	await seedTransaction({
		account: savingsAccount.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Realtime Savings Bonus',
		value: 25
	});

	// Wait for the savings credit to appear (confirms realtime is working)
	await expect(page.getByText('Realtime Savings Bonus')).toBeVisible();
	// The brokerage credit should NOT appear (matches kind but wrong account)
	await expect(page.getByText('Realtime Brokerage Dividend')).not.toBeVisible();

	// URL should contain both filters
	await expect(page).toHaveURL(/account=/);
	await expect(page).toHaveURL(/amount=credits/);

	// Reload and verify both filters persist
	await page.reload();
	await expect(page.getByLabel('Account', { exact: true })).toContainText('High Yield Savings');
	await expect(page.getByLabel('Type')).toContainText('Credits only');
	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).not.toBeVisible();

	// Clear account filter while keeping type filter
	await page.getByLabel('Clear account filter').click();

	// Both credit transactions should now be visible
	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Dividend Income')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).not.toBeVisible();
	await expect(page.getByText('Stock Purchase')).not.toBeVisible();
});
