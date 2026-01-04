import { UTCDate } from '@date-fns/utc';
import { expect, test, type Page } from '@playwright/test';
import { addMonths, startOfMonth, startOfYear, subYears } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

type PeriodOption =
	| 'this-month'
	| 'last-month'
	| 'last-3-months'
	| 'last-6-months'
	| 'last-12-months'
	| 'year-to-date'
	| 'last-year'
	| 'lifetime';

test('transactions table responds to period and type filters', async ({ page }) => {
	const user = await seedUser('taylor');

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
		{ description: 'Excluded Adjustment', value: 75, monthsOffset: 0, day: 20, excluded: true }
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

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: /Invoice Payment/ })).toBeVisible();

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

	const typeFilters: Array<{
		label: string;
		predicate: (txn: { value: number; excluded: boolean }) => boolean;
	}> = [
		{ label: 'Any amounts', predicate: () => true },
		{ label: 'Credits only', predicate: (txn) => txn.value > 0 },
		{ label: 'Debits only', predicate: (txn) => txn.value < 0 },
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
	const excludedRow = page.getByRole('row', { name: /Excluded Adjustment/ });
	await expect(excludedRow).toBeVisible();
	const excludedAmount = excludedRow.locator('td').nth(4).locator('.border-dashed');
	await expect(excludedAmount).toBeVisible();

	const info = test.info();
	const isMobile = info.project.name?.toLowerCase().includes('mobile') ?? false;
	if (!isMobile) {
		await excludedAmount.hover();
	}
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

	const rowsForBatch = page.getByRole('row', {
		name: new RegExp(escapeRegex(prefix))
	});
	const previousButton = page.getByRole('button', { name: 'Previous' });
	const nextButton = page.getByRole('button', { name: 'Next' });
	await expect(previousButton).toBeDisabled();
	await expect(nextButton).toBeEnabled();
	await expect(rowsForBatch).toHaveCount(50);

	const lastDescription = seededDescriptions[seededDescriptions.length - 1] ?? '';
	await expect(
		page.getByRole('row', { name: new RegExp(escapeRegex(lastDescription)) })
	).toHaveCount(0);

	await nextButton.click();
	await expect(rowsForBatch).toHaveCount(5);
	await expect(
		page.getByRole('row', { name: new RegExp(escapeRegex(lastDescription)) })
	).toBeVisible();
	await expect(nextButton).toBeDisabled();
	await expect(previousButton).toBeEnabled();

	await previousButton.click();
	await expect(rowsForBatch).toHaveCount(50);
	await expect(
		page.getByRole('row', {
			name: new RegExp(escapeRegex(`${prefix} 010`))
		})
	).toBeVisible();
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
	const creditRows = page.getByRole('row', {
		name: new RegExp(escapeRegex(prefix))
	});
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
	const pattern = new RegExp(escapeRegex(description));
	const row = page.getByRole('row', { name: pattern });
	if (shouldBeVisible) {
		await expect(row).toHaveCount(1);
		await expect(row).toBeVisible();
	} else {
		await expect(row).toHaveCount(0);
	}
}

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`);
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

test('custom date range with periodLabel from URL displays the label', async ({ page }) => {
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

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2024-03-15T12:00:00.000Z',
		description: 'March Salary',
		value: 5000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2024-04-15T12:00:00.000Z',
		description: 'April Salary',
		value: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);

	// Navigate with periodLabel param (as would be set by cashflow chart link)
	await page.goto(
		'/transactions?periodFrom=2024-03-01&periodTo=2024-04-01&periodLabel=March%202024'
	);

	// Period trigger should show the custom label from URL
	await expect(page.getByLabel('Period')).toContainText('March 2024');

	// Only March transaction should be visible
	await expect(page.getByText('March Salary')).toBeVisible();
	await expect(page.getByText('April Salary')).not.toBeVisible();
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
	// Click on day 10 of last month (start of range)
	await page.getByRole('button', { name: /10,/ }).click();
	// Click on day 20 of last month (end of range)
	await page.getByRole('button', { name: /20,/ }).click();

	// URL should be updated with periodFrom and periodTo
	await expect(page).toHaveURL(/periodFrom=/);
	await expect(page).toHaveURL(/periodTo=/);

	// Transactions should be filtered to the selected range
	await expect(page.getByText('Last Month Payment')).toBeVisible();
	await expect(page.getByText('Two Months Ago Payment')).not.toBeVisible();
	await expect(page.getByText('This Month Payment')).not.toBeVisible();
});

test('switching from custom range back to preset clears custom URL params', async ({ page }) => {
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
		description: 'Recent Transaction',
		value: 500
	});

	await page.goto('/');
	await signIn(page, user.email);

	// Start with custom date range in URL
	await page.goto(
		'/transactions?periodFrom=2024-01-01&periodTo=2024-02-01&periodLabel=January%202024'
	);
	await expect(page.getByLabel('Period')).toContainText('January 2024');

	// Open period picker and select a preset
	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'This month' }).click();

	// URL should now have period=this-month, not periodFrom/periodTo
	await expect(page).toHaveURL(/period=this-month/);
	await expect(page).not.toHaveURL(/periodFrom=/);
	await expect(page).not.toHaveURL(/periodTo=/);
	await expect(page).not.toHaveURL(/periodLabel=/);

	// Period trigger should show preset label
	await expect(page.getByLabel('Period')).toContainText('This month');

	// Recent transaction should be visible
	await expect(page.getByText('Recent Transaction')).toBeVisible();
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
