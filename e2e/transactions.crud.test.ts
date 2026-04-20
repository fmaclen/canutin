import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { formatDateForInput, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getTransactionLabelsByName,
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedTransactionLabel,
	seedUser
} from './pocketbase.helpers';

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
	await page.getByLabel('Date').fill(formatDateForInput(new UTCDate()));
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
	await page.getByLabel('Notes').fill('Met with Sam to review Q3 plans');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Transaction added').first()).toBeVisible();
	await expect(page.url()).toContain('/transactions');
	const moonbeamRow = page.getByRole('row', { name: /Moonbeam Cafe/ });
	await expect(moonbeamRow).toBeVisible();
	await expect(moonbeamRow.getByText('-$45.50')).toBeVisible();
	await expect(moonbeamRow.getByText('Meridian Checking')).toBeVisible();
	await expect(moonbeamRow.getByText('Food & Dining')).toBeVisible();
	await expect(moonbeamRow.getByText('Personal')).toBeVisible();

	await page.getByRole('link', { name: 'Add transaction' }).click();
	await expect(page).toHaveURL('/transactions/add');

	await page.getByLabel('Description').fill('Credit Card Payment');
	await page.getByLabel('Amount').fill('-500');
	await page.getByLabel('Date').fill(formatDateForInput(subDays(new UTCDate(), 1)));
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
	const creditCardRow = page.getByRole('row', { name: /Credit Card Payment/ });
	await expect(creditCardRow).toBeVisible();
	await expect(creditCardRow.getByText('-$500.00')).toBeVisible();
	await expect(creditCardRow.getByText('Apex Credit Card')).toBeVisible();
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

	const initialDate = setHours(subDays(new UTCDate(), 5), 12);
	const updatedDateStr = formatDateForInput(setHours(subDays(new UTCDate(), 2), 12));

	const transaction = await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: initialDate.toISOString(),
		description: 'Paperclip Office Supply Co',
		value: -150,
		labels: [officeLabel.id]
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const paperclipRow = page.getByRole('row', { name: /Paperclip Office Supply Co/ });
	await expect(paperclipRow).toBeVisible();
	await expect(paperclipRow.getByText('-$150.00')).toBeVisible();
	await expect(paperclipRow.getByText('Northwind Business')).toBeVisible();
	await expect(paperclipRow.getByText('Office Supplies')).toBeVisible();

	await page.getByRole('link', { name: 'Paperclip Office Supply Co' }).click();
	await expect(page).toHaveURL(new RegExp(`/transactions/${transaction.id}(\\?|$)`));
	await expect(page.getByLabel('Description')).toHaveValue('Paperclip Office Supply Co');
	await expect(page.getByLabel('Amount')).toHaveValue('-$150.00');
	await expect(page.getByLabel('Date')).toHaveValue(formatDateForInput(initialDate));
	await expect(page.getByLabel('Account')).toHaveText('Northwind Business');
	await expect(page.getByLabel('Labels')).toHaveValue('Office Supplies');
	await expect(page.getByLabel('Notes')).toHaveValue('');

	await page.getByLabel('Description').fill('Skyward Airlines Conference Trip');
	await page.getByLabel('Amount').fill('-450');
	await page.getByLabel('Date').fill(updatedDateStr);
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Eastgate Savings' }).click();
	await page.getByLabel('Labels').fill('Business Travel, Conference');
	await page.getByLabel('Notes').fill('Reimbursable — keep receipt for expense report');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated')).toBeVisible();
	await expect(page).toHaveURL('/transactions');
	await expect(page.getByText('Paperclip Office Supply Co')).not.toBeVisible();

	const skywardRow = page.getByRole('row', { name: /Skyward Airlines Conference Trip/ });
	await expect(skywardRow).toBeVisible();
	await expect(skywardRow.getByText('-$450.00')).toBeVisible();
	await expect(skywardRow.getByText('Eastgate Savings')).toBeVisible();
	await expect(skywardRow.getByText('Business Travel')).toBeVisible();
	await expect(skywardRow.getByText('Conference', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Skyward Airlines Conference Trip' }).click();
	await expect(page).toHaveURL(new RegExp(`/transactions/${transaction.id}(\\?|$)`));
	await expect(page.getByLabel('Description')).toHaveValue('Skyward Airlines Conference Trip');
	await expect(page.getByLabel('Amount')).toHaveValue('-$450.00');
	await expect(page.getByLabel('Date')).toHaveValue(updatedDateStr);
	await expect(page.getByLabel('Account')).toHaveText('Eastgate Savings');
	await expect(page.getByLabel('Labels')).toHaveValue('Business Travel, Conference');
	await expect(page.getByLabel('Notes')).toHaveValue(
		'Reimbursable — keep receipt for expense report'
	);

	// TODO: Flaky on mobile - checkbox.check() doesn't change state intermittently
	await page.getByLabel('Excluded from totals').click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated').first()).toBeVisible();
	await expect(page).toHaveURL('/transactions');

	await page.getByRole('link', { name: 'Skyward Airlines Conference Trip' }).click();
	await expect(page).toHaveURL(new RegExp(`/transactions/${transaction.id}(\\?|$)`));
	await expect(page.getByLabel('Excluded from totals')).toBeChecked();

	await page.getByLabel('Excluded from totals').click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated').first()).toBeVisible();
	await expect(page).toHaveURL('/transactions');

	await page.getByRole('link', { name: 'Skyward Airlines Conference Trip' }).click();
	await expect(page).toHaveURL(new RegExp(`/transactions/${transaction.id}(\\?|$)`));
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

	const transactionDate = setHours(subDays(new UTCDate(), 3), 12);

	const transaction = await seedTransaction({
		account: account.id,
		owner: user.id,
		date: transactionDate.toISOString(),
		description: 'Greenleaf Pharmacy',
		value: -85,
		labels: [healthLabel.id]
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/transactions/${transaction.id}`);
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);
	await expect(page.getByLabel('Description')).toHaveValue('Greenleaf Pharmacy');
	await expect(page.getByLabel('Amount')).toHaveValue('-$85.00');
	await expect(page.getByLabel('Date')).toHaveValue(formatDateForInput(transactionDate));
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
		date: setHours(subDays(new UTCDate(), 2), 12).toISOString(),
		description: 'StreamFlix Annual Subscription',
		value: -200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByText('StreamFlix Annual Subscription')).toBeVisible();

	await page.getByRole('link', { name: 'StreamFlix Annual Subscription' }).click();
	await expect(page).toHaveURL(new RegExp(`/transactions/${transaction.id}(\\?|$)`));

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
	const currentYear = new UTCDate().getUTCFullYear();
	const seededTransactionRow = page.getByRole('row', { name: /Fresh Groceries Market/ });
	const seededTransactionDate = new UTCDate(currentYear - 1, 5, 15, 12, 0, 0, 0);
	const isLastYearTransactionsResponse = (url: string) =>
		url.includes('/api/collections/transactions/records') &&
		url.includes(`${currentYear - 1}-01-01`) &&
		url.includes(`${currentYear}-01-01`);

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
	await Promise.all([
		page.waitForResponse(
			(response) =>
				response.request().method() === 'GET' && isLastYearTransactionsResponse(response.url())
		),
		page.getByRole('button', { name: 'Last year' }).click()
	]);
	await expect(page.getByLabel('Period')).toContainText('Last year');

	await page.getByLabel('Type').click();
	await Promise.all([
		page.waitForResponse(
			(response) =>
				response.request().method() === 'GET' && isLastYearTransactionsResponse(response.url())
		),
		page.getByRole('option', { name: 'Debits only' }).click()
	]);
	await expect(page.getByLabel('Type')).toContainText('Debits only');
	await expect(seededTransactionRow).toHaveCount(0);

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: seededTransactionDate.toISOString(),
		description: 'Fresh Groceries Market',
		value: -125
	});

	await expect.poll(async () => seededTransactionRow.count(), { timeout: 10_000 }).toBe(1);
});

test('reuses existing labels instead of creating duplicates', async ({ page }) => {
	const user = await seedUser('marcus');

	const account = await seedAccount({
		name: 'Pinewood Checking',
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

	const groceriesLabel = await seedTransactionLabel({ name: 'Groceries', owner: user.id });
	const diningLabel = await seedTransactionLabel({ name: 'Dining', owner: user.id });

	const tx1Date = setHours(subDays(new UTCDate(), 1), 12);
	const tx2Date = setHours(subDays(new UTCDate(), 2), 12);
	const tx3Date = setHours(subDays(new UTCDate(), 3), 12);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: tx1Date.toISOString(),
		description: 'Sunrise Grocery Store',
		value: -100
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: tx2Date.toISOString(),
		description: 'Downtown Deli',
		value: -25
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: tx3Date.toISOString(),
		description: 'Corner Market',
		value: -50
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	expect(await getTransactionLabelsByName(user.id, 'Groceries')).toHaveLength(1);
	expect(await getTransactionLabelsByName(user.id, 'Dining')).toHaveLength(1);

	// Add new transaction with existing label
	await page.getByRole('link', { name: 'Add transaction' }).click();
	await page.getByLabel('Description').fill('Farmers Market');
	await page.getByLabel('Amount').fill('-75');
	await page.getByLabel('Date').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Pinewood Checking' }).click();
	await page.getByLabel('Labels').fill('Groceries');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Transaction added').first()).toBeVisible();

	const groceriesAfterAdd = await getTransactionLabelsByName(user.id, 'Groceries');
	expect(groceriesAfterAdd).toHaveLength(1);
	expect(groceriesAfterAdd[0].id).toBe(groceriesLabel.id);

	// Edit existing transaction with existing labels
	await page.getByRole('link', { name: 'Sunrise Grocery Store' }).click();
	await page.getByLabel('Labels').fill('Groceries, Dining');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated')).toBeVisible();
	await expect(page).toHaveURL('/transactions');

	const groceriesAfterEdit = await getTransactionLabelsByName(user.id, 'Groceries');
	const diningAfterEdit = await getTransactionLabelsByName(user.id, 'Dining');
	expect(groceriesAfterEdit).toHaveLength(1);
	expect(diningAfterEdit).toHaveLength(1);
	expect(groceriesAfterEdit[0].id).toBe(groceriesLabel.id);
	expect(diningAfterEdit[0].id).toBe(diningLabel.id);

	// Batch edit with existing label
	const deliRow = page.getByRole('row', { name: 'Downtown Deli' });
	const marketRow = page.getByRole('row', { name: 'Corner Market' });
	await deliRow.getByRole('checkbox').check();
	await marketRow.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	// Edit checkboxes order: Description (0), Amount (1), Date (2), Account (3), Labels (4), Excluded (5)
	const editCheckboxes = page.getByRole('checkbox', { name: 'Edit' });
	await editCheckboxes.nth(4).check();
	await page.getByLabel('Labels').fill('Dining');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByText('2 transactions updated')).toBeVisible();

	const diningAfterBatch = await getTransactionLabelsByName(user.id, 'Dining');
	expect(diningAfterBatch).toHaveLength(1);
	expect(diningAfterBatch[0].id).toBe(diningLabel.id);

	expect(await getTransactionLabelsByName(user.id, 'Groceries')).toHaveLength(1);
	expect(await getTransactionLabelsByName(user.id, 'Dining')).toHaveLength(1);
});
