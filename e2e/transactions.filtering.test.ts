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

		await page.getByLabel('Period').click();
		const selectedPresetButton = page.getByRole('button', { name: label, exact: true });
		await expect(selectedPresetButton).toHaveAttribute('data-selected');
		await page.keyboard.press('Escape');

		await expectPeriodFilteredRows(page, transactions, value, now);

		await page.reload();
		await expect(page.getByLabel('Period')).toContainText(label);
		if (label !== 'Last 3 months') {
			await expect(page.getByLabel('Period')).not.toContainText('Last 3 months');
		}
		await expectPeriodFilteredRows(page, transactions, value, now);
	}

	await expect(page.getByLabel('Period')).toContainText('Lifetime');
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page).not.toHaveURL(/period=/);
	await expect(page.getByLabel('Period')).toContainText('Last 3 months');

	const excludedRow = page.getByRole('row', { name: 'Excluded Adjustment' });
	await expect(excludedRow).toBeVisible();
	const excludedAmount = excludedRow.getByText('$75.00');
	await expect(excludedAmount).toBeVisible();
});

test('transactions table responds to type filters', async ({ page }) => {
	const { user, transactions } = await seedFilteringTransactions('taylor-types');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Invoice Payment' })).toBeVisible();
	await expect(page.getByLabel('Type')).toContainText('Any amounts');

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

	await nextButton.click();
	await expect(rowsForBatch).toHaveCount(5);

	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);

	const creditRows = page.getByRole('row', { name: prefix });
	await expect(creditRows.first()).toBeVisible();
});

test('credits filter paginates across pages client-side', async ({ page }) => {
	const user = await seedUser('dakota');

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

	const prefix = 'Credit Batch Tx';
	const baseDate = new Date();
	const seededDescriptions: string[] = [];
	for (let i = 0; i < 51; i++) {
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
			value: 100 + i
		});
		seededDescriptions.push(description);
	}

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Lifetime' }).click();
	await expect(page.getByLabel('Period')).toContainText('Lifetime');

	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();
	await expect(page.getByLabel('Type')).toContainText('Credits only');

	const rowsForBatch = page.getByRole('row', { name: prefix });
	const previousButton = page.getByRole('button', { name: 'Previous' });
	const nextButton = page.getByRole('button', { name: 'Next' });
	await expect(rowsForBatch).toHaveCount(50);
	await expect(previousButton).toBeDisabled();
	await expect(nextButton).toBeEnabled();

	const firstDescription = seededDescriptions[0] ?? '';
	const lastDescription = seededDescriptions[seededDescriptions.length - 1] ?? '';
	await expect(page.getByRole('row', { name: firstDescription })).toBeVisible();
	await expect(page.getByRole('row', { name: lastDescription })).toHaveCount(0);

	await nextButton.click();
	await expect(rowsForBatch).toHaveCount(1);
	await expect(page.getByRole('row', { name: lastDescription })).toBeVisible();
	await expect(page.getByRole('row', { name: firstDescription })).toHaveCount(0);
	await expect(nextButton).toBeDisabled();
	await expect(previousButton).toBeEnabled();

	await previousButton.click();
	await expect(rowsForBatch).toHaveCount(50);
	await expect(page.getByRole('row', { name: firstDescription })).toBeVisible();
	await expect(previousButton).toBeDisabled();
	await expect(nextButton).toBeEnabled();
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

async function seedLabelFilteringTransactions(userName: string, includeUnlabeled: boolean) {
	const user = await seedUser(userName);
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
	const date = new UTCDate().toISOString();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date,
		description: 'Farm Stand Produce',
		value: -42,
		labels: [groceriesLabel.id]
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date,
		description: 'Electric Company Bill',
		value: -118,
		labels: [utilitiesLabel.id]
	});
	if (includeUnlabeled) {
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date,
			description: 'Unlabeled Cash Withdrawal',
			value: -80
		});
	}

	return { user, groceriesLabel, utilitiesLabel };
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

async function expectPeriodFilteredRows(
	page: Page,
	transactions: Array<{ description: string; date: Date }>,
	value: PeriodOption,
	now: Date
) {
	const expectedVisibleCount = transactions.filter((txn) =>
		isWithinPeriod(txn.date, value, now)
	).length;
	await expect(page.locator('tbody tr')).toHaveCount(expectedVisibleCount);
	for (const txn of transactions) {
		await expectRowVisibility(page, txn.description, isWithinPeriod(txn.date, value, now));
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

	// NOTE: This test could theoretically fail if run exactly at midnight on Dec 31st,
	// as the test's "thisYear" and the backend's "thisYear" could differ by one year.
	const now = new UTCDate();
	const thisYearStart = startOfYear(now);
	const lastYearStart = startOfYear(subYears(now, 1));

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

	const midYear = new UTCDate(lastYearStart.getUTCFullYear(), 6, 15, 12, 0, 0, 0);
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: midYear.toISOString(),
		description: 'Mid Year Payment',
		value: 300
	});

	const beforePeriodEnd = new UTCDate(thisYearStart.getTime() - 1000);
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: beforePeriodEnd.toISOString(),
		description: 'Before Period End Boundary',
		value: 400
	});

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

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Last year' }).click();
	await expect(page.getByLabel('Period')).toContainText('Last year');

	await expect(page.getByText('Before Period Boundary')).not.toBeVisible();
	await expect(page.getByText('At Period End Boundary')).not.toBeVisible();

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

	const now = new UTCDate();
	const thisMonth = startOfMonth(now);
	const lastMonth = addMonths(thisMonth, -1);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: dateForMonthOffset(lastMonth, 0, 15).toISOString(),
		description: 'Last Month Salary',
		value: 5000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: dateForMonthOffset(thisMonth, 0, 15).toISOString(),
		description: 'This Month Salary',
		value: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);

	const fromDate = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	const toDate = `${thisMonth.getUTCFullYear()}-${String(thisMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	const monthLabel = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

	// Test's explicit purpose is direct-URL initialization with periodLabel (as set by cashflow chart link)
	await page.goto(
		`/transactions?periodFrom=${fromDate}&periodTo=${toDate}&periodLabel=${encodeURIComponent(monthLabel)}`
	);

	await expect(page.getByLabel('Period')).toContainText(monthLabel);

	await expect(page.getByText('Last Month Salary')).toBeVisible();
	await expect(page.getByText('This Month Salary')).not.toBeVisible();

	await page.getByLabel('Period').click();

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

	await page.getByLabel('Period').click();

	await expect(page.getByRole('button', { name: 'Last month' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'This month' })).toBeVisible();

	await page.getByRole('button', { name: 'Previous' }).click();

	// The calendar shows 2 months side-by-side, use .first() to select from the left month
	await page.getByRole('button', { name: /10,/ }).first().click();
	await page.getByRole('button', { name: /20,/ }).first().click();

	await expect(page).toHaveURL(/periodFrom=/);
	await expect(page).toHaveURL(/periodTo=/);

	await expect(page.getByText('Last Month Payment')).toBeVisible();
	await expect(page.getByText('Two Months Ago Payment')).not.toBeVisible();
	await expect(page.getByText('This Month Payment')).not.toBeVisible();
});

test.describe('date range picker in a UTC+ timezone', () => {
	test.use({ timezoneId: 'Asia/Tokyo' });

	test('picking the local day stores that local date, not the prior UTC day', async ({ page }) => {
		// 2025-06-14T20:00:00Z is June 15 in Tokyo (UTC+9) but June 14 in UTC.
		await page.clock.setFixedTime(new Date('2025-06-14T20:00:00Z'));

		const user = await seedUser('tokyo');

		const account = await seedAccount({
			name: 'Tokyo Checking',
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

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');

		await page.getByLabel('Period').click();
		await page
			.getByRole('button', { name: /June 15,/ })
			.first()
			.click();
		await page
			.getByRole('button', { name: /June 16,/ })
			.first()
			.click();

		await expect(page).toHaveURL(/periodFrom=2025-06-15/);
		await expect(page).toHaveURL(/periodTo=2025-06-17/);
	});
});

test.describe('date range picker in a UTC- timezone', () => {
	test.use({ timezoneId: 'Pacific/Honolulu' });

	test('picking the local day stores that local date, not the later UTC day', async ({ page }) => {
		// 2025-06-16T05:00:00Z is June 15 in Honolulu (UTC-10) but June 16 in UTC.
		await page.clock.setFixedTime(new Date('2025-06-16T05:00:00Z'));

		const user = await seedUser('honolulu');

		const account = await seedAccount({
			name: 'Honolulu Checking',
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

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');

		await page.getByLabel('Period').click();
		await page
			.getByRole('button', { name: /June 15,/ })
			.first()
			.click();
		await page
			.getByRole('button', { name: /June 16,/ })
			.first()
			.click();

		await expect(page).toHaveURL(/periodFrom=2025-06-15/);
		await expect(page).toHaveURL(/periodTo=2025-06-17/);
	});
});

test.describe('period presets in a UTC+ timezone at a month boundary', () => {
	test.use({ timezoneId: 'Asia/Tokyo' });

	test('"This month" uses the local month, not the UTC month', async ({ page }) => {
		// 2025-06-30T20:00:00Z is July 1 in Tokyo (UTC+9) but June 30 in UTC.
		await page.clock.setFixedTime(new Date('2025-06-30T20:00:00Z'));

		const user = await seedUser('boundary');

		const account = await seedAccount({
			name: 'Boundary Checking',
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
			date: new UTCDate(2025, 6, 1, 12, 0, 0, 0).toISOString(),
			description: 'July Payment',
			value: 200
		});
		await seedTransaction({
			account: account.id,
			owner: user.id,
			date: new UTCDate(2025, 5, 20, 12, 0, 0, 0).toISOString(),
			description: 'June Payment',
			value: 100
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Transactions');

		await page.getByLabel('Period').click();
		await page.getByRole('button', { name: 'This month' }).click();
		await expect(page.getByLabel('Period')).toContainText('This month');

		await expect(page.getByText('July Payment')).toBeVisible();
		await expect(page.getByText('June Payment')).not.toBeVisible();
	});
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

	const fromDate = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	const toDate = `${thisMonth.getUTCFullYear()}-${String(thisMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
	// Test's explicit purpose is direct-URL initialization with a custom periodFrom/periodTo range
	await page.goto(`/transactions?periodFrom=${fromDate}&periodTo=${toDate}`);

	await expect(page.getByText('Last Month Transaction')).toBeVisible();
	await expect(page.getByText('This Month Transaction')).not.toBeVisible();
	await expect(page.getByText('Two Months Ago Transaction')).not.toBeVisible();

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Last 3 months' }).click();

	await expect(page).toHaveURL(/period=last-3-months/);
	await expect(page).not.toHaveURL(/periodFrom=/);
	await expect(page).not.toHaveURL(/periodTo=/);
	await expect(page).not.toHaveURL(/periodLabel=/);

	await expect(page.getByLabel('Period')).toContainText('Last 3 months');

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

	// Test's explicit purpose is direct-URL behavior with an invalid date format
	await page.goto('/transactions?periodFrom=invalid-date&periodTo=2024-01-31');

	await expect(page.getByLabel('Period')).toBeVisible();
	await expect(page.getByLabel('Period')).toContainText('Last 3 months');

	// Test's explicit purpose is direct-URL behavior with an end date before the start date
	await page.goto('/transactions?periodFrom=2024-03-01&periodTo=2024-01-01');

	await expect(page.getByLabel('Period')).toBeVisible();
	const hasError = await page
		.getByText(/invalid|error/i)
		.isVisible()
		.catch(() => false);
	if (!hasError) {
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

	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).toBeVisible();
	await expect(page.getByText('Online Shopping')).toBeVisible();

	await expect(page.getByLabel('Account', { exact: true })).toContainText('All accounts');

	await page.getByLabel('Account', { exact: true }).click();

	const accountListbox = page.getByRole('listbox');
	await expect(accountListbox.getByText('Cash', { exact: true })).toBeVisible();
	await expect(accountListbox.getByText('Debt', { exact: true })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Everyday Checking' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Rewards Credit Card' })).toBeVisible();

	await page.getByRole('option', { name: 'Everyday Checking' }).click();

	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).not.toBeVisible();
	await expect(page.getByText('Online Shopping')).not.toBeVisible();

	await expect(page.getByLabel('Account', { exact: true })).toContainText('Everyday Checking');

	await expect(page).toHaveURL(/account=/);

	await page.reload();
	await expect(page.getByLabel('Account', { exact: true })).toContainText('Everyday Checking');
	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).not.toBeVisible();

	await page.getByLabel('Account', { exact: true }).click();
	await page.getByRole('option', { name: 'Rewards Credit Card' }).click();

	await expect(page.getByText('Restaurant Dinner')).toBeVisible();
	await expect(page.getByText('Online Shopping')).toBeVisible();
	await expect(page.getByText('Paycheck Direct Deposit')).not.toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).not.toBeVisible();

	await page.getByLabel('Clear account filter').click();

	await expect(page.getByText('Paycheck Direct Deposit')).toBeVisible();
	await expect(page.getByText('ATM Withdrawal')).toBeVisible();
	await expect(page.getByText('Restaurant Dinner')).toBeVisible();
	await expect(page.getByText('Online Shopping')).toBeVisible();

	await expect(page).not.toHaveURL(/account=/);
});

test('transactions can be filtered by label', async ({ page }) => {
	const { user } = await seedLabelFilteringTransactions('nora', true);

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
	// Multi-select keeps the menu open after picking an item; close it before asserting the trigger
	await page.keyboard.press('Escape');

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

test('clicking a label chip on a row applies the label filter', async ({ page }) => {
	const { user } = await seedLabelFilteringTransactions('sage', true);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).toBeVisible();
	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');

	const groceriesChip = page.getByRole('button', { name: 'Filter by Groceries' });
	await expect(groceriesChip).toHaveAttribute('aria-pressed', 'false');

	await groceriesChip.click();

	await expect(groceriesChip).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Label', { exact: true })).toContainText('Groceries');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).not.toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).not.toBeVisible();
	await expect(page).toHaveURL(/label=/);

	await groceriesChip.click();

	await expect(groceriesChip).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).toBeVisible();
	await expect(page).not.toHaveURL(/label=/);
});

test('label filter combobox filters options by typing and ignores the record id', async ({
	page
}) => {
	const { user, groceriesLabel } = await seedLabelFilteringTransactions('wesley', false);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await page.getByLabel('Label', { exact: true }).click();
	const groceriesOption = page.getByRole('option', { name: 'Groceries' });
	const utilitiesOption = page.getByRole('option', { name: 'Utilities' });
	await expect(groceriesOption).toBeVisible();
	await expect(utilitiesOption).toBeVisible();

	const searchInput = page.getByPlaceholder('Search', { exact: true });
	await searchInput.fill('Gro');

	await expect(groceriesOption).toBeVisible();
	await expect(utilitiesOption).toHaveCount(0);

	// The combobox scores against the label only; the opaque record id must never match. Pick
	// a slice of the id that is absent from both label names so a hit could only come from the id.
	const idFragment = groceriesLabel.id
		.toLowerCase()
		.split('')
		.filter((char) => !'groceriesutilities'.includes(char))
		.join('')
		.slice(0, 3);
	expect(idFragment.length).toBeGreaterThan(0);
	await searchInput.fill(idFragment);

	await expect(groceriesOption).toHaveCount(0);
	await expect(utilitiesOption).toHaveCount(0);
	await expect(page.getByText('No matches')).toBeVisible();

	await searchInput.fill('');

	await expect(groceriesOption).toBeVisible();
	await expect(utilitiesOption).toBeVisible();

	await searchInput.fill('Gro');
	await groceriesOption.click();
	await page.keyboard.press('Escape');

	await expect(page.getByLabel('Label', { exact: true })).toContainText('Groceries');
	await expect(page).toHaveURL(/label=/);
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).not.toBeVisible();
});

test('selecting multiple labels filters with OR semantics', async ({ page }) => {
	const { user, groceriesLabel, utilitiesLabel } = await seedLabelFilteringTransactions(
		'willow',
		true
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).toBeVisible();
	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');

	// The dropdown lists every label, so it can select both even after the first pick
	// filters the Utilities row (and its chip) out of the table. Multi-select keeps the
	// menu open between clicks; close it with Escape before asserting the trigger.
	await page.getByLabel('Label', { exact: true }).click();
	await page.getByRole('option', { name: 'Groceries' }).click();
	await page.getByRole('option', { name: 'Utilities' }).click();
	await page.keyboard.press('Escape');

	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).not.toBeVisible();
	await expect(page.getByLabel('Label', { exact: true })).toContainText('2 labels');

	const labelParams = new URL(page.url()).searchParams.getAll('label');
	expect(labelParams).toContain(groceriesLabel.id);
	expect(labelParams).toContain(utilitiesLabel.id);

	await page.getByLabel('Clear label filter').click();

	await expect(page.getByLabel('Label', { exact: true })).toContainText('All labels');
	await expect(page.getByText('Farm Stand Produce')).toBeVisible();
	await expect(page.getByText('Electric Company Bill')).toBeVisible();
	await expect(page.getByText('Unlabeled Cash Withdrawal')).toBeVisible();
	await expect(page).not.toHaveURL(/label=/);
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

	await page.getByLabel('Account', { exact: true }).click();
	await page.getByRole('option', { name: 'High Yield Savings' }).click();

	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).toBeVisible();
	await expect(page.getByText('Dividend Income')).not.toBeVisible();
	await expect(page.getByText('Stock Purchase')).not.toBeVisible();

	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).not.toBeVisible();
	await expect(page.getByText('Dividend Income')).not.toBeVisible();
	await expect(page.getByText('Stock Purchase')).not.toBeVisible();

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

	await expect(page.getByText('Realtime Savings Bonus')).toBeVisible();
	await expect(page.getByText('Realtime Brokerage Dividend')).not.toBeVisible();

	await expect(page).toHaveURL(/account=/);
	await expect(page).toHaveURL(/amount=credits/);

	await page.reload();
	await expect(page.getByLabel('Account', { exact: true })).toContainText('High Yield Savings');
	await expect(page.getByLabel('Type')).toContainText('Credits only');
	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).not.toBeVisible();

	await page.getByLabel('Clear account filter').click();

	await expect(page.getByText('Interest Payment')).toBeVisible();
	await expect(page.getByText('Dividend Income')).toBeVisible();
	await expect(page.getByText('Transfer to Checking')).not.toBeVisible();
	await expect(page.getByText('Stock Purchase')).not.toBeVisible();
});
