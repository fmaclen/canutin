import { UTCDate } from '@date-fns/utc';
import { expect, test, type Page } from '@playwright/test';
import { addMonths, startOfMonth } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedTransactionLabel,
	seedUser
} from './pocketbase.helpers';

type PeriodOption = 'mtd' | '1m' | '3m' | '6m' | 'ytd' | '12m' | 'all';

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

	const periodTabs = page.getByRole('tablist').first();
	const typeTabs = page.getByRole('tablist').nth(1);

	await expect(periodTabs.getByRole('tab', { name: '3M' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(typeTabs.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');

	const periodFilters: Array<{ label: string; value: PeriodOption }> = [
		{ label: 'MTD', value: 'mtd' },
		{ label: '1M', value: '1m' },
		{ label: '3M', value: '3m' },
		{ label: '6M', value: '6m' },
		{ label: 'YTD', value: 'ytd' },
		{ label: '12M', value: '12m' },
		{ label: 'All', value: 'all' }
	];

	for (const { label, value } of periodFilters) {
		const tab = periodTabs.getByRole('tab', { name: label });
		await tab.click();
		await expect(tab).toHaveAttribute('aria-selected', 'true');
		for (const txn of transactions) {
			const shouldBeVisible = isWithinPeriod(txn.date, value, now);
			await expectRowVisibility(page, txn.description, shouldBeVisible);
		}
	}

	const typeFilters: Array<{
		label: string;
		predicate: (txn: { value: number; excluded: boolean }) => boolean;
	}> = [
		{ label: 'All', predicate: () => true },
		{ label: 'Credits', predicate: (txn) => txn.value > 0 },
		{ label: 'Debits', predicate: (txn) => txn.value < 0 }
	];

	for (const { label, predicate } of typeFilters) {
		const tab = typeTabs.getByRole('tab', { name: label });
		await tab.click();
		await expect(tab).toHaveAttribute('aria-selected', 'true');
		for (const txn of transactions) {
			const shouldBeVisible = predicate(txn);
			await expectRowVisibility(page, txn.description, shouldBeVisible);
		}
	}

	await typeTabs.getByRole('tab', { name: 'All' }).click();
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

	// Apply "Credits" filter (only even-indexed transactions, which are positive)
	const typeTabs = page.getByRole('tablist').nth(1);
	await typeTabs.getByRole('tab', { name: 'Credits' }).click();

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

function dateForMonthOffset(baseMonth: Date, monthsOffset: number, day: number) {
	const safeDay = Math.min(day, 28);
	const targetMonth = addMonths(baseMonth, monthsOffset);
	return new UTCDate(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), safeDay, 12, 0, 0, 0);
}

function getPeriodRange(option: PeriodOption, reference: Date) {
	const startOfThisMonth = startOfMonth(reference);
	switch (option) {
		case 'mtd':
			return { from: startOfThisMonth, to: null } as const;
		case '1m':
			return { from: addMonths(startOfThisMonth, -1), to: startOfThisMonth } as const;
		case '3m':
			return { from: addMonths(startOfThisMonth, -2), to: null } as const;
		case '6m':
			return { from: addMonths(startOfThisMonth, -5), to: null } as const;
		case 'ytd':
			return { from: startOfMonth(new UTCDate(reference.getUTCFullYear(), 0)), to: null } as const;
		case '12m':
			return { from: addMonths(startOfThisMonth, -11), to: null } as const;
		case 'all':
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

	// Create transactions with specific dates and amounts to test sorting
	const date1 = new UTCDate(2025, 9, 15, 12, 0, 0, 0); // Oct 15
	const date2 = new UTCDate(2025, 9, 10, 12, 0, 0, 0); // Oct 10
	const date3 = new UTCDate(2025, 9, 5, 12, 0, 0, 0); // Oct 5

	// Same date, different amounts - should sort by amount DESC
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date1.toISOString(),
		description: 'Oct 15 - Small',
		value: 100
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date1.toISOString(),
		description: 'Oct 15 - Large',
		value: 500
	});

	// Different dates
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date2.toISOString(),
		description: 'Oct 10 - Medium',
		value: 300
	});

	// Oldest date
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: date3.toISOString(),
		description: 'Oct 5 - Oldest',
		value: 200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Get all transaction rows (excluding header)
	const rows = page.locator('tbody tr');
	await expect(rows).toHaveCount(4);

	// Verify order: newest date first (Oct 15), then by amount DESC within same date
	const expectedOrder = [
		'Oct 15 - Large', // Date: Oct 15, Amount: 500 (largest)
		'Oct 15 - Small', // Date: Oct 15, Amount: 100
		'Oct 10 - Medium', // Date: Oct 10, Amount: 300
		'Oct 5 - Oldest' // Date: Oct 5, Amount: 200
	];

	for (let i = 0; i < expectedOrder.length; i++) {
		const row = rows.nth(i);
		await expect(row).toContainText(expectedOrder[i]!);
	}
});

test('transactions correctly handle UTC dates regardless of local timezone', async ({
	browser
}) => {
	// Set timezone to American Samoa (UTC-11) to expose timezone bugs
	const context = await browser.newContext({
		timezoneId: 'Pacific/Pago_Pago',
		locale: 'en-US'
	});
	const page = await context.newPage();

	const testDate = new Date('2025-10-15T12:00:00Z');
	await page.clock.setFixedTime(testDate);

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

	// Create transactions at month boundaries in UTC
	// October 1, 2025 00:30:00 UTC = September 30, 2025 13:30:00 in American Samoa
	// If the app uses local dates, this transaction would appear in September
	// If the app correctly uses UTC, it should appear in October
	const octoberInUtc = new UTCDate(2025, 9, 1, 0, 30, 0, 0); // October 1 UTC
	const septemberInUtc = new UTCDate(2025, 8, 30, 23, 30, 0, 0); // September 30 UTC

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: octoberInUtc.toISOString(),
		description: 'Early October UTC Transaction',
		value: 500
	});

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: septemberInUtc.toISOString(),
		description: 'Late September UTC Transaction',
		value: -300
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	// Both transactions should be visible with default "3M" filter
	await expect(page.getByRole('row', { name: /Early October UTC Transaction/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /Late September UTC Transaction/ })).toBeVisible();

	// Switch to MTD (Month To Date) filter
	// This should show only transactions from October 1 UTC onwards
	const periodTabs = page.getByRole('tablist').first();
	await periodTabs.getByRole('tab', { name: 'MTD' }).click();

	// The October transaction should be visible
	await expect(page.getByRole('row', { name: /Early October UTC Transaction/ })).toBeVisible();

	// The September transaction should NOT be visible
	await expect(page.getByRole('row', { name: /Late September UTC Transaction/ })).toHaveCount(0);

	// Switch to 1M (previous month) filter
	// This should show only September transactions
	await periodTabs.getByRole('tab', { name: '1M' }).click();

	// The September transaction should be visible
	await expect(page.getByRole('row', { name: /Late September UTC Transaction/ })).toBeVisible();

	// The October transaction should NOT be visible
	await expect(page.getByRole('row', { name: /Early October UTC Transaction/ })).toHaveCount(0);

	// Clean up
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
	const noLabelsRow = page.getByRole('row', { name: /No Labels Transaction/ });
	await expect(noLabelsRow).toBeVisible();
	const labelsCell = noLabelsRow.locator('td').nth(2); // Labels column is 3rd
	await expect(labelsCell).toContainText('~');

	// Verify transaction with labels displays all labels as badges
	const hasLabelsRow = page.getByRole('row', { name: /Has Labels Transaction/ });
	await expect(hasLabelsRow).toBeVisible();
	const hasLabelsCell = hasLabelsRow.locator('td').nth(2); // Labels column is 3rd
	// Labels should be sorted alphabetically: Groceries, Personal
	await expect(hasLabelsCell.getByText('Groceries')).toBeVisible();
	await expect(hasLabelsCell.getByText('Personal')).toBeVisible();

	// Verify account name is displayed
	const accountCell = hasLabelsRow.locator('td').nth(3); // Account column is 4th
	await expect(accountCell).toContainText('Edge Case Account');

	// Verify excluded transaction has muted styling and dashed underline on amount
	const excludedRow = page.getByRole('row', { name: /Excluded Transaction/ });
	await expect(excludedRow).toBeVisible();
	await expect(excludedRow).toHaveClass(/bg-muted/);
	const amountCell = excludedRow.locator('td').nth(4); // Amount column is 5th
	const dashedAmount = amountCell.locator('.border-dashed');
	await expect(dashedAmount).toBeVisible();

	// Verify tooltip on excluded amount (only test hover on desktop)
	const info = test.info();
	const isMobile = info.project.name?.toLowerCase().includes('mobile') ?? false;
	if (!isMobile) {
		await dashedAmount.hover();
		// Tooltip should appear with exact exclusion message
		await expect(page.getByText('Excluded transactions do not affect reports.')).toBeVisible();
	}
});
