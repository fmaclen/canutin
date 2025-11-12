import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	recordExists,
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedUser,
	updateAccount
} from './pocketbase.helpers';

test('accounts table reflects filters, transactions, and aggregate totals', async ({ page }) => {
	const user = await seedUser('lily');

	const openAccount = await seedAccount({
		name: 'Daily Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: openAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2500
	});
	await seedTransaction({
		account: openAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Deposit',
		value: 150
	});
	await seedTransaction({
		account: openAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Groceries',
		value: -50
	});
	await seedTransaction({
		account: openAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Reversal',
		value: 0,
		excluded: new Date().toISOString()
	});

	const excludedAccount = await seedAccount({
		name: 'Sandbox Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings',
		excluded: new Date().toISOString()
	});
	await seedAccountBalance({
		account: excludedAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	const closedAccount = await seedAccount({
		name: 'Legacy Card',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card',
		closed: new Date().toISOString()
	});
	await seedAccountBalance({
		account: closedAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: -400
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	const openRow = page.getByRole('row', { name: /Daily Checking/ });
	await expect(openRow).toBeVisible();

	const openCells = openRow.locator('td');
	await expect(openCells.nth(6)).toContainText('$2,500.00');
	await expect(openCells.nth(5)).toHaveText('3');
	await expect(openRow.getByText('Excluded')).not.toBeVisible();

	const excludedRow = page.getByRole('row', { name: /Sandbox Account/ });
	await expect(excludedRow).toBeVisible();

	const excludedCells = excludedRow.locator('td');
	await expect(excludedCells.nth(6)).toContainText('$1,000.00');
	await expect(excludedRow.getByText('Excluded')).toBeVisible();
	await expect(excludedCells.nth(5)).toHaveText('~');

	const aggregateRow = page.getByRole('row', { name: /Accounts aggregate total/ });
	await expect(aggregateRow).toContainText('$2,500.00');
	await expect(aggregateRow).not.toContainText('$1,000.00');

	await page.getByRole('tab', { name: 'All' }).click();
	await expect(page.getByRole('row', { name: /Legacy Card/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /Sandbox Account/ })).toBeVisible();
	await expect(aggregateRow).toContainText('$3,100.00');

	await page.getByRole('tab', { name: 'Closed' }).click();
	const closedRow = page.getByRole('row', { name: /Legacy Card/ });
	await expect(closedRow).toContainText('-$400');
	await expect(closedRow.getByText('Closed')).toBeVisible();
	await expect(aggregateRow).toContainText('-$400');
});

test('user can add a new account', async ({ page }) => {
	const user = await seedUser('quinn');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');

	await expect(page.getByRole('row', { name: 'High Yield Savings' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Credit Card' })).not.toBeVisible();

	await page.getByRole('link', { name: 'Add account' }).click();
	await expect(page).toHaveURL('/accounts/add');

	await page.getByLabel('Name').fill('High Yield Savings');
	await page.getByLabel('Institution').fill('Chase Bank');
	await page.getByLabel('Balance group').click();
	await page.getByRole('option', { name: 'Cash' }).click();
	await page.getByLabel('Category').fill('Savings');
	await page.getByRole('spinbutton', { name: 'Balance' }).fill('5000');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Account added successfully')).toBeVisible();
	await expect(page).toHaveURL('/accounts');

	const savingsRow = page.getByRole('row', { name: 'High Yield Savings' });
	await expect(savingsRow).toBeVisible();

	const savingsCells = savingsRow.locator('td');
	await expect(savingsCells.nth(0)).toContainText('High Yield Savings');
	await expect(savingsCells.nth(1)).toContainText('Chase Bank');
	await expect(savingsCells.nth(6)).toContainText('$5,000.00');

	await page.getByRole('link', { name: 'Add account' }).click();
	await expect(page).toHaveURL('/accounts/add');

	await page.getByLabel('Name').fill('Credit Card');
	await page.getByLabel('Balance group').click();
	await page.getByRole('option', { name: 'Debt' }).click();
	await page.getByLabel('Category').fill('Credit card');
	await page.getByRole('spinbutton', { name: 'Balance' }).fill('-1200');
	await expect(page.getByText('Account added successfully')).not.toBeVisible();

	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Account added successfully')).toBeVisible();
	await expect(page).toHaveURL('/accounts');

	const creditCardRow = page.getByRole('row', { name: 'Credit Card' });
	await expect(creditCardRow).toBeVisible();

	const creditCardCells = creditCardRow.locator('td');
	await expect(creditCardCells.nth(0)).toContainText('Credit Card');
	await expect(creditCardCells.nth(1)).toContainText('~');
	await expect(creditCardCells.nth(6)).toContainText('-$1,200.00');
});

test('user can edit account details and update balance', async ({ page }) => {
	const user = await seedUser('rachel');

	const checkingAccount = await seedAccount({
		name: 'Primary Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		institution: 'Bank of America'
	});
	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 3000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');

	const initialRow = page.getByRole('row', { name: 'Primary Checking' });
	await expect(initialRow).toBeVisible();

	const initialCells = initialRow.locator('td');
	await expect(initialCells.nth(0)).toContainText('Primary Checking');
	await expect(initialCells.nth(6)).toContainText('$3,000.00');

	await initialRow.getByRole('link', { name: 'Primary Checking' }).click();
	await expect(page).toHaveURL(`/accounts/${checkingAccount.id}`);
	await expect(page.getByLabel('Name')).toHaveValue('Primary Checking');
	await expect(page.getByLabel('Institution')).toHaveValue('Bank of America');
	await expect(page.getByLabel('Category')).toHaveValue('Checking');

	await page.getByLabel('Name').fill('Business Checking');
	await page.getByLabel('Institution').fill('Wells Fargo');
	await page.getByLabel('Category').fill('Checking');
	await page.getByLabel('Balance group').click();
	await page.getByRole('option', { name: 'Cash' }).click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Account updated successfully')).toBeVisible();
	await expect(
		page.getByText(
			'This account has been updated elsewhere and your changes may be based on outdated data'
		)
	).not.toBeVisible();

	await page.getByRole('spinbutton', { name: 'Balance' }).fill('4500');
	await page.getByRole('button', { name: 'Update' }).click();
	await expect(page.getByText('Account added successfully')).toBeVisible();

	await page.getByLabel('breadcrumb').getByRole('link', { name: 'Accounts' }).click();
	await expect(page).toHaveURL('/accounts');
	await expect(page.getByRole('row', { name: 'Primary Checking' })).not.toBeVisible();

	const updatedRow = page.getByRole('row', { name: 'Business Checking' });
	await expect(updatedRow).toBeVisible();

	const updatedCells = updatedRow.locator('td');
	await expect(updatedCells.nth(0)).toContainText('Business Checking');
	await expect(updatedCells.nth(1)).toContainText('Wells Fargo');
	await expect(updatedCells.nth(3)).toContainText('Checking');
	await expect(updatedCells.nth(6)).toContainText('$4,500.00');

	await updatedRow.getByRole('link', { name: 'Business Checking' }).click();
	await expect(page).toHaveURL(`/accounts/${checkingAccount.id}`);
	await expect(page.getByLabel('Name')).toHaveValue('Business Checking');
	await expect(page.getByLabel('Institution')).toHaveValue('Wells Fargo');
	await expect(page.getByLabel('Category')).toHaveValue('Checking');
	await expect(page.getByLabel('Balance group')).toHaveText('Cash');
	await expect(page.getByLabel('Exclude from net worth')).not.toBeChecked();

	await page.getByLabel('Exclude from net worth').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Account updated successfully').first()).toBeVisible();
	await expect(page.getByLabel('Exclude from net worth')).toBeChecked();

	await page.getByLabel('Exclude from net worth').uncheck();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Account updated successfully').first()).toBeVisible();
	await expect(page.getByLabel('Exclude from net worth')).not.toBeChecked();
});

test('user can directly navigate to account edit page', async ({ page }) => {
	const user = await seedUser('samuel');

	const savingsAccount = await seedAccount({
		name: 'Emergency Fund',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings',
		institution: 'Ally Bank'
	});
	await seedAccountBalance({
		account: savingsAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);

	await page.goto(`/accounts/${savingsAccount.id}`);
	await expect(page).toHaveURL(`/accounts/${savingsAccount.id}`);
	await expect(page.getByLabel('Name')).toHaveValue('Emergency Fund');
	await expect(page.getByLabel('Institution')).toHaveValue('Ally Bank');
	await expect(page.getByLabel('Category')).toHaveValue('Savings');
	await expect(page.getByRole('spinbutton', { name: 'Balance' })).toHaveValue('10000');
});

test('user sees stale data warning and can refresh form', async ({ page }) => {
	const user = await seedUser('taylor');

	const investmentAccount = await seedAccount({
		name: 'Investment Account',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: investmentAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 50000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');

	await page.getByRole('link', { name: 'Investment Account' }).click();
	await expect(page).toHaveURL(`/accounts/${investmentAccount.id}`);
	await expect(page.getByLabel('Name')).toHaveValue('Investment Account');

	await page.getByLabel('Name').fill('My Investment Account');
	await updateAccount(investmentAccount.id, { name: 'Retirement Account' });
	await expect(
		page.getByText(
			'This account has been updated elsewhere and your changes may be based on outdated data'
		)
	).toBeVisible();

	const refreshButton = page.getByRole('button', { name: 'Refresh' });
	await expect(refreshButton).toBeVisible();

	await refreshButton.click();
	await expect(page.getByText("You're now viewing the latest data for this account")).toBeVisible();
	await expect(page.getByLabel('Name')).toHaveValue('Retirement Account');
});

test('user can delete account and cascade deletes transactions and balances', async ({ page }) => {
	const user = await seedUser('ursula');

	const checkingAccount = await seedAccount({
		name: 'Old Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});

	const balance = await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1500
	});

	const transaction1 = await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Salary',
		value: 3000
	});

	const transaction2 = await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Rent',
		value: -1500
	});

	expect(await recordExists('accounts', checkingAccount.id)).toBe(true);
	expect(await recordExists('accountBalances', balance.id)).toBe(true);
	expect(await recordExists('transactions', transaction1.id)).toBe(true);
	expect(await recordExists('transactions', transaction2.id)).toBe(true);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');

	const accountRow = page.getByRole('row', { name: 'Old Checking' });
	await expect(accountRow).toBeVisible();

	await accountRow.getByRole('link', { name: 'Old Checking' }).click();
	await expect(page).toHaveURL(`/accounts/${checkingAccount.id}`);

	await page.getByRole('button', { name: 'Delete' }).first().click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	await dialog.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Account deleted successfully')).toBeVisible();
	await expect(page).toHaveURL('/accounts');
	await expect(page.getByRole('row', { name: 'Old Checking' })).not.toBeVisible();
	expect(await recordExists('accounts', checkingAccount.id)).toBe(false);
	expect(await recordExists('accountBalances', balance.id)).toBe(false);
	expect(await recordExists('transactions', transaction1.id)).toBe(false);
	expect(await recordExists('transactions', transaction2.id)).toBe(false);
});
