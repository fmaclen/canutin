import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays, subYears } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { formatDateForInput, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
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
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);
	await expect(page.getByLabel('Description')).toHaveValue('Paperclip Office Supply Co');
	await expect(page.getByLabel('Amount')).toHaveValue('-$150.00');
	await expect(page.getByLabel('Date')).toHaveValue(formatDateForInput(initialDate));
	await expect(page.getByLabel('Account')).toHaveText('Northwind Business');
	await expect(page.getByLabel('Labels')).toHaveValue('Office Supplies');

	await page.getByLabel('Description').fill('Skyward Airlines Conference Trip');
	await page.getByLabel('Amount').fill('-450');
	await page.getByLabel('Date').fill(updatedDateStr);
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Eastgate Savings' }).click();
	await page.getByLabel('Labels').fill('Business Travel, Conference');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Transaction updated')).toBeVisible();

	await page.getByLabel('breadcrumb').getByRole('link', { name: 'Transactions' }).click();
	await expect(page.url()).toContain('/transactions');
	await expect(page.getByText('Paperclip Office Supply Co')).not.toBeVisible();

	const skywardRow = page.getByRole('row', { name: /Skyward Airlines Conference Trip/ });
	await expect(skywardRow).toBeVisible();
	await expect(skywardRow.getByText('-$450.00')).toBeVisible();
	await expect(skywardRow.getByText('Eastgate Savings')).toBeVisible();
	await expect(skywardRow.getByText('Business Travel')).toBeVisible();
	await expect(skywardRow.getByText('Conference', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Skyward Airlines Conference Trip' }).click();
	await expect(page).toHaveURL(`/transactions/${transaction.id}`);
	await expect(page.getByLabel('Description')).toHaveValue('Skyward Airlines Conference Trip');
	await expect(page.getByLabel('Amount')).toHaveValue('-$450.00');
	await expect(page.getByLabel('Date')).toHaveValue(updatedDateStr);
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
	await page.getByRole('button', { name: 'Last year' }).click();
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
