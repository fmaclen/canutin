import { UTCDate } from '@date-fns/utc';
import { expect, test, type Page } from '@playwright/test';
import { addMonths, startOfMonth, subYears } from 'date-fns';

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
		await page.getByRole('option', { name: label }).click();
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
	const currentYear = now.getUTCFullYear();
	const currentMonth = now.getUTCMonth();

	const startOfThisMonthUtc = new UTCDate(currentYear, currentMonth, 1, 0, 30, 0, 0);
	const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
	const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
	const lastMonthLastDay = new UTCDate(currentYear, currentMonth, 0).getUTCDate();
	const endOfLastMonthUtc = new UTCDate(lastMonthYear, lastMonth, lastMonthLastDay, 23, 30, 0, 0);

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
	await page.getByRole('option', { name: 'This month' }).click();
	await expect(page.getByText('Early This Month UTC Transaction')).toHaveCount(1);
	await expect(page.getByText('Late Last Month UTC Transaction')).toHaveCount(0);

	await page.getByLabel('Period').click();
	await page.getByRole('option', { name: 'Last month' }).click();
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
		await expect(page.getByText('Excluded transactions do not affect reports')).toBeVisible();
	}
});

test('user can add a new transaction', async ({ page }) => {
	const user = await seedUser('bella');

	const checkingAccount = await seedAccount({
		name: 'Meridian Checking',
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

	const creditCardAccount = await seedAccount({
		name: 'Apex Credit Card',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit Card'
	});
	await seedAccountBalance({
		account: creditCardAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: -2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Moonbeam Cafe')).not.toBeVisible();
	await expect(page.getByText('Freelance Design Project')).not.toBeVisible();

	await page.getByRole('link', { name: 'Add transaction' }).click();
	await expect(page).toHaveURL('/transactions/add');

	await page.getByLabel('Description').fill('Moonbeam Cafe');
	await page.getByLabel('Amount').fill('-45.50');
	await page.getByLabel('Date').fill('2025-11-01');
	await page.getByLabel('Account').click();

	await expect(page.getByText('Cash')).toBeVisible();
	await expect(page.getByText('Debt')).toBeVisible();
	await expect(page.getByRole('option', { name: 'Meridian Checking' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Apex Credit Card' })).toBeVisible();

	await page.getByRole('option', { name: 'Meridian Checking' }).click();
	await expect(page.getByText('Cash')).not.toBeVisible();
	await expect(page.getByText('Debt')).not.toBeVisible();
	await expect(page.getByRole('option', { name: 'Meridian Checking' })).not.toBeVisible();
	await expect(page.getByRole('option', { name: 'Apex Credit Card' })).not.toBeVisible();

	await page.getByLabel('Labels').fill('Food & Dining, Personal');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Transaction added').first()).toBeVisible();
	await expect(page.url()).toContain('/transactions');
	await expect(page.getByText('Moonbeam Cafe')).toBeVisible();
	await expect(page.getByText('-$45.50')).toBeVisible();
	await expect(page.getByText('Meridian Checking').first()).toBeVisible();
	await expect(page.getByText('Food & Dining').first()).toBeVisible();
	await expect(page.getByText('Personal').first()).toBeVisible();

	await page.getByRole('link', { name: 'Add transaction' }).click();
	await expect(page).toHaveURL('/transactions/add');

	await page.getByLabel('Description').fill('Credit Card Payment');
	await page.getByLabel('Amount').fill('-500');
	await page.getByLabel('Date').fill('2025-11-05');
	await page.getByLabel('Account').click();
	await expect(page.getByText('Cash')).toBeVisible();
	await expect(page.getByText('Debt')).toBeVisible();
	await expect(page.getByRole('option', { name: 'Meridian Checking' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Apex Credit Card' })).toBeVisible();

	await page.getByRole('option', { name: 'Apex Credit Card' }).click();
	await expect(page.getByText('Cash')).not.toBeVisible();
	await expect(page.getByText('Debt')).not.toBeVisible();
	await expect(page.getByRole('option', { name: 'Meridian Checking' })).not.toBeVisible();
	await expect(page.getByRole('option', { name: 'Apex Credit Card' })).not.toBeVisible();

	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Transaction added').first()).toBeVisible();
	await expect(page.url()).toContain('/transactions');
	await expect(page.getByText('Credit Card Payment')).toBeVisible();
	await expect(page.getByText('-$500.00')).toBeVisible();
	await expect(page.getByText('Apex Credit Card')).toBeVisible();
});

test('user can edit transaction details', async ({ page }) => {
	const user = await seedUser('clara');

	const checkingAccount = await seedAccount({
		name: 'Northwind Business',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 3000
	});

	const savingsAccount = await seedAccount({
		name: 'Eastgate Savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: savingsAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 8000
	});

	const officeLabel = await seedTransactionLabel({
		name: 'Office Supplies',
		owner: user.id
	});

	const transaction = await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: new UTCDate(2025, 10, 15, 12, 0, 0, 0).toISOString(),
		description: 'Paperclip Office Supply Co',
		value: -150,
		labels: [officeLabel.id]
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('Paperclip Office Supply Co')).toBeVisible();
	await expect(page.getByText('-$150.00')).toBeVisible();
	await expect(page.getByText('Northwind Business').first()).toBeVisible();
	await expect(page.getByText('Office Supplies').first()).toBeVisible();

	await page.getByRole('link', { name: 'Paperclip Office Supply Co' }).click();
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);
	await expect(page.getByLabel('Description')).toHaveValue('Paperclip Office Supply Co');
	await expect(page.getByLabel('Amount')).toHaveValue('-150');
	await expect(page.getByLabel('Date')).toHaveValue('2025-11-15');
	await expect(page.getByLabel('Account')).toHaveText('Northwind Business');
	await expect(page.getByLabel('Labels')).toHaveValue('Office Supplies');

	await page.getByLabel('Description').fill('Skyward Airlines Conference Trip');
	await page.getByLabel('Amount').fill('-450');
	await page.getByLabel('Date').fill('2025-11-20');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Eastgate Savings' }).click();
	await page.getByLabel('Labels').fill('Business Travel, Conference');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated')).toBeVisible();

	await page.getByLabel('breadcrumb').getByRole('link', { name: 'Transactions' }).click();
	await expect(page.url()).toContain('/transactions');
	await expect(page.getByText('Paperclip Office Supply Co')).not.toBeVisible();

	await expect(page.getByText('Skyward Airlines Conference Trip')).toBeVisible();
	await expect(page.getByText('-$450.00')).toBeVisible();
	await expect(page.getByText('Eastgate Savings').first()).toBeVisible();
	await expect(page.getByText('Business Travel').first()).toBeVisible();
	await expect(page.getByText('Conference').first()).toBeVisible();

	await page.getByRole('link', { name: 'Skyward Airlines Conference Trip' }).click();
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);
	await expect(page.getByLabel('Description')).toHaveValue('Skyward Airlines Conference Trip');
	await expect(page.getByLabel('Amount')).toHaveValue('-450');
	await expect(page.getByLabel('Date')).toHaveValue('2025-11-20');
	await expect(page.getByLabel('Account')).toHaveText('Eastgate Savings');
	await expect(page.getByLabel('Labels')).toHaveValue('Business Travel, Conference');

	await page.getByLabel('Excluded from totals').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated').first()).toBeVisible();
	await expect(page.getByLabel('Excluded from totals')).toBeChecked();

	await page.getByLabel('Excluded from totals').uncheck();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated').first()).toBeVisible();
	await expect(page.getByLabel('Excluded from totals')).not.toBeChecked();
});

test('user can directly navigate to transaction edit page', async ({ page }) => {
	const user = await seedUser('diana');

	const account = await seedAccount({
		name: 'Riverside Community',
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

	const healthLabel = await seedTransactionLabel({
		name: 'Healthcare',
		owner: user.id
	});

	const transaction = await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new UTCDate(2025, 10, 10, 12, 0, 0, 0).toISOString(),
		description: 'Greenleaf Pharmacy',
		value: -85,
		labels: [healthLabel.id]
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/transactions/${transaction.id}`);
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);
	await expect(page.getByLabel('Description')).toHaveValue('Greenleaf Pharmacy');
	await expect(page.getByLabel('Amount')).toHaveValue('-85');
	await expect(page.getByLabel('Date')).toHaveValue('2025-11-10');
	await expect(page.getByLabel('Account')).toHaveText('Riverside Community');
});

test('user can delete transaction', async ({ page }) => {
	const user = await seedUser('edward');

	const checkingAccount = await seedAccount({
		name: 'Lakeside Checking',
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

	const transaction = await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: new UTCDate(2025, 10, 12, 12, 0, 0, 0).toISOString(),
		description: 'StreamFlix Annual Subscription',
		value: -200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('StreamFlix Annual Subscription')).toBeVisible();

	await page.getByRole('link', { name: 'StreamFlix Annual Subscription' }).click();
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);

	await page.getByRole('button', { name: 'Delete' }).first().click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	await dialog.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Transaction deleted')).toBeVisible();
	await expect(page.url()).toContain('/transactions');
	await expect(page.getByText('StreamFlix Annual Subscription')).not.toBeVisible();
});

test('transactions list updates in real-time when new transaction is added', async ({ page }) => {
	const user = await seedUser('frank');

	const checkingAccount = await seedAccount({
		name: 'Realtime Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});

	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new UTCDate().toISOString(),
		value: 3000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await page.getByLabel('Period').click();
	await page.getByRole('option', { name: 'Last year' }).click();
	await expect(page.getByLabel('Period')).toContainText('Last year');

	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Debits only' }).click();
	await expect(page.getByLabel('Type')).toContainText('Debits only');
	await expect(page.getByText('Fresh Groceries Market')).toHaveCount(0);

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: subYears(new UTCDate(), 1).toISOString(),
		description: 'Fresh Groceries Market',
		value: -125
	});

	await expect(page.getByText('Fresh Groceries Market')).toHaveCount(1);
});
