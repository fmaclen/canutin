import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedTransactionLabel,
	seedUser
} from './pocketbase.helpers';

test('user can select transactions and see selection toolbar', async ({ page }) => {
	const user = await seedUser('greta');

	const checkingAccount = await seedAccount({
		name: 'Silverlake Checking',
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

	const tx1Date = setHours(subDays(new UTCDate(), 1), 12);
	const tx2Date = setHours(subDays(new UTCDate(), 2), 12);
	const tx3Date = setHours(subDays(new UTCDate(), 3), 12);

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: tx1Date.toISOString(),
		description: 'Sunrise Bakery',
		value: -25
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: tx2Date.toISOString(),
		description: 'Coastal Coffee',
		value: -15
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: tx3Date.toISOString(),
		description: 'Harbor Groceries',
		value: -85
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Sunrise Bakery' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Coastal Coffee' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Harbor Groceries' })).toBeVisible();

	await expect(page.getByText('Batch editor')).not.toBeVisible();

	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	const sunriseRow = page.getByRole('row', { name: 'Sunrise Bakery' });
	const coastalRow = page.getByRole('row', { name: 'Coastal Coffee' });
	const harborRow = page.getByRole('row', { name: 'Harbor Groceries' });

	await expect(headerCheckbox).not.toBeChecked();
	await expect(sunriseRow.getByRole('checkbox')).not.toBeChecked();
	await expect(coastalRow.getByRole('checkbox')).not.toBeChecked();
	await expect(harborRow.getByRole('checkbox')).not.toBeChecked();

	await sunriseRow.getByRole('checkbox').check();
	await expect(sunriseRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByText('Batch editor')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Edit 1 transaction' })).toBeVisible();

	await expect(headerCheckbox).toHaveAttribute('data-state', 'indeterminate');

	await coastalRow.getByRole('checkbox').check();
	await expect(coastalRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	await expect(headerCheckbox).toHaveAttribute('data-state', 'indeterminate');

	await harborRow.getByRole('checkbox').check();
	await expect(harborRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();

	await expect(headerCheckbox).toBeChecked();

	await headerCheckbox.uncheck();
	await expect(headerCheckbox).not.toBeChecked();
	await expect(sunriseRow.getByRole('checkbox')).not.toBeChecked();
	await expect(coastalRow.getByRole('checkbox')).not.toBeChecked();
	await expect(harborRow.getByRole('checkbox')).not.toBeChecked();
	await expect(page.getByText('Batch editor')).not.toBeVisible();

	await headerCheckbox.check();
	await expect(headerCheckbox).toBeChecked();
	await expect(sunriseRow.getByRole('checkbox')).toBeChecked();
	await expect(coastalRow.getByRole('checkbox')).toBeChecked();
	await expect(harborRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();
});

test('selection persists across pagination', async ({ page }) => {
	const user = await seedUser('henry');

	const checkingAccount = await seedAccount({
		name: 'Mountainview Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const baseDate = new UTCDate();
	for (let i = 0; i < 60; i++) {
		await seedTransaction({
			account: checkingAccount.id,
			owner: user.id,
			date: setHours(subDays(baseDate, i), 12).toISOString(),
			description: `Transaction ${String(i + 1).padStart(2, '0')}`,
			value: -(i + 1) * 10
		});
	}

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Lifetime' }).click();

	await expect(page.getByRole('row', { name: 'Transaction 01' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Go to next page' })).toBeVisible();

	const tx01Row = page.getByRole('row', { name: 'Transaction 01' });
	const tx02Row = page.getByRole('row', { name: 'Transaction 02' });
	await tx01Row.getByRole('checkbox').check();
	await tx02Row.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	await page.getByRole('button', { name: 'Go to next page' }).click();
	await expect(page.getByRole('row', { name: 'Transaction 51' })).toBeVisible();

	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	const tx51Row = page.getByRole('row', { name: 'Transaction 51' });
	await tx51Row.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();

	await page.getByRole('button', { name: 'Go to previous page' }).click();
	await expect(page.getByRole('row', { name: 'Transaction 01' })).toBeVisible();

	await expect(tx01Row.getByRole('checkbox')).toBeChecked();
	await expect(tx02Row.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();
});

test('user can select all results across pages', async ({ page }) => {
	const user = await seedUser('nadia');

	const checkingAccount = await seedAccount({
		name: 'Valleyview Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const baseDate = new UTCDate();
	for (let i = 0; i < 60; i++) {
		await seedTransaction({
			account: checkingAccount.id,
			owner: user.id,
			date: setHours(subDays(baseDate, i), 12).toISOString(),
			description: `Bulk Transaction ${String(i + 1).padStart(2, '0')}`,
			value: -(i + 1) * 10
		});
	}

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Lifetime' }).click();

	await expect(page.getByRole('row', { name: 'Bulk Transaction 01' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Go to next page' })).toBeVisible();

	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 50 transactions' })).toBeVisible();

	await expect(page.getByRole('button', { name: 'Select all 60 results' })).toBeVisible();

	await page.getByRole('button', { name: 'Select all 60 results' }).click();
	await expect(page.getByRole('link', { name: 'Edit 60 transactions' })).toBeVisible();

	await expect(page.getByRole('button', { name: 'Select all 60 results' })).not.toBeVisible();

	await page.getByRole('button', { name: 'Go to next page' }).click();
	await expect(page.getByRole('row', { name: 'Bulk Transaction 51' })).toBeVisible();

	const tx51Row = page.getByRole('row', { name: 'Bulk Transaction 51' });
	const tx60Row = page.getByRole('row', { name: 'Bulk Transaction 60' });
	await expect(tx51Row.getByRole('checkbox')).toBeChecked();
	await expect(tx60Row.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 60 transactions' })).toBeVisible();

	await tableHeader.getByRole('checkbox').uncheck();

	await expect(page.getByRole('link', { name: 'Edit 60 transactions' })).not.toBeVisible();
	await expect(page.getByText('Batch editor')).not.toBeVisible();
	await expect(tx51Row.getByRole('checkbox')).not.toBeChecked();
	await expect(tx60Row.getByRole('checkbox')).not.toBeChecked();

	await page.getByRole('button', { name: 'Go to previous page' }).click();
	await expect(page.getByRole('row', { name: 'Bulk Transaction 01' })).toBeVisible();

	const tx01Row = page.getByRole('row', { name: 'Bulk Transaction 01' });
	await expect(tx01Row.getByRole('checkbox')).not.toBeChecked();
});

test('batch editor displays mixed values correctly', async ({ page }) => {
	const user = await seedUser('irene');

	const checkingAccount = await seedAccount({
		name: 'Riverside Checking',
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

	const savingsAccount = await seedAccount({
		name: 'Riverside Savings',
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

	const groceriesLabel = await seedTransactionLabel({
		name: 'Groceries',
		owner: user.id
	});

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 1), 12).toISOString(),
		description: 'Whole Foods Market',
		value: -150,
		labels: [groceriesLabel.id]
	});
	await seedTransaction({
		account: savingsAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 2), 12).toISOString(),
		description: 'Target Shopping',
		value: -75
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 3), 12).toISOString(),
		description: 'Amazon Purchase',
		value: -200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();

	await page.getByRole('link', { name: 'Edit 3 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	await expect(page.getByLabel('breadcrumb').getByText('Batch editor')).toBeVisible();
	await expect(page.getByText('Update 3 transactions')).toBeVisible();

	await expect(page.getByText('Multiple accounts')).toBeVisible();
	await expect(page.getByPlaceholder('Multiple descriptions')).toBeVisible();
	await expect(page.getByPlaceholder('Multiple dates')).toBeVisible();
	await expect(page.getByPlaceholder('Multiple labels')).toBeVisible();
	await expect(page.getByLabel('Amount')).toHaveValue('Multiple amounts');

	await expect(page.getByLabel('Account')).toBeDisabled();
	await expect(page.getByLabel('Description')).toBeDisabled();
	await expect(page.getByLabel('Date')).toBeDisabled();
	await expect(page.getByLabel('Labels')).toBeDisabled();

	const editCheckboxes = page.getByRole('checkbox', { name: 'Edit' });
	const checkboxCount = await editCheckboxes.count();
	expect(checkboxCount).toBe(6);
	for (let i = 0; i < checkboxCount; i++) {
		await expect(editCheckboxes.nth(i)).not.toBeChecked();
	}

	await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

	await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();

	await expect(page.getByText('Permanently delete all 3 transactions')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();

	await page.getByRole('button', { name: 'Discard' }).click();
	await expect(page).toHaveURL('/transactions');

	await expect(page.getByRole('row', { name: 'Whole Foods Market' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Target Shopping' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Amazon Purchase' })).toBeVisible();

	await expect(page.getByText('Batch editor')).not.toBeVisible();
});

test('batch editor displays common values when transactions share them', async ({ page }) => {
	const user = await seedUser('julia');

	const checkingAccount = await seedAccount({
		name: 'Oakwood Checking',
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

	const subscriptionsLabel = await seedTransactionLabel({
		name: 'Subscriptions',
		owner: user.id
	});

	const sameDate = setHours(subDays(new UTCDate(), 5), 12);

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: sameDate.toISOString(),
		description: 'Netflix',
		value: -15.99,
		labels: [subscriptionsLabel.id]
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: sameDate.toISOString(),
		description: 'Netflix',
		value: -22.99,
		labels: [subscriptionsLabel.id]
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');
	await expect(page.getByText('Update 2 transactions')).toBeVisible();

	await expect(page.getByLabel('Account')).toHaveText('Oakwood Checking');
	await expect(page.getByText('Multiple accounts')).not.toBeVisible();

	await expect(page.getByLabel('Description')).toHaveValue('Netflix');
	await expect(page.getByPlaceholder('Multiple descriptions')).not.toBeVisible();

	await expect(page.getByLabel('Labels')).toHaveValue('Subscriptions');
	await expect(page.getByPlaceholder('Multiple labels')).not.toBeVisible();

	await expect(page.getByLabel('Amount')).toHaveValue('Multiple amounts');

	await expect(page.getByText('Permanently delete all 2 transactions')).toBeVisible();
});

test('user can batch update transaction fields', async ({ page }) => {
	const user = await seedUser('kevin');

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

	const savingsAccount = await seedAccount({
		name: 'Lakeside Savings',
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

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 1), 12).toISOString(),
		description: 'Old Description One',
		value: -50
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 2), 12).toISOString(),
		description: 'Old Description Two',
		value: -75
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Old Description One' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Old Description Two' })).toBeVisible();

	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	// Field order: Description(0), Amount(1), Date(2), Account(3), Labels(4), Excluded(5)
	const editCheckboxes = page.getByRole('checkbox', { name: 'Edit' });

	await editCheckboxes.nth(0).check();
	await expect(page.getByLabel('Description')).toBeEnabled();
	await page.getByLabel('Description').fill('Updated Description');

	await editCheckboxes.nth(4).check();
	await page.getByLabel('Labels').fill('Utilities, Monthly');

	await editCheckboxes.nth(3).check();
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Lakeside Savings' }).click();

	await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();

	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByText('2 transactions updated')).toBeVisible();

	await expect(page).toHaveURL('/transactions');

	await expect(page.getByText('Batch editor')).not.toBeVisible();

	await expect(page.getByRole('row', { name: 'Old Description One' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Old Description Two' })).not.toBeVisible();

	const updatedRow1 = page.getByRole('row', { name: 'Updated Description' }).first();
	const updatedRow2 = page.getByRole('row', { name: 'Updated Description' }).nth(1);
	await expect(updatedRow1).toBeVisible();
	await expect(updatedRow2).toBeVisible();

	await expect(updatedRow1.getByText('Monthly')).toBeVisible();
	await expect(updatedRow1.getByText('Utilities')).toBeVisible();
	await expect(updatedRow2.getByText('Monthly')).toBeVisible();
	await expect(updatedRow2.getByText('Utilities')).toBeVisible();

	await expect(updatedRow1.getByText('Lakeside Savings')).toBeVisible();
	await expect(updatedRow2.getByText('Lakeside Savings')).toBeVisible();
});

test('user can batch delete transactions', async ({ page }) => {
	const user = await seedUser('laura');

	const checkingAccount = await seedAccount({
		name: 'Meadowbrook Checking',
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

	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 1), 12).toISOString(),
		description: 'Transaction To Delete A',
		value: -100
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 2), 12).toISOString(),
		description: 'Transaction To Delete B',
		value: -200
	});
	await seedTransaction({
		account: checkingAccount.id,
		owner: user.id,
		date: setHours(subDays(new UTCDate(), 3), 12).toISOString(),
		description: 'Transaction To Keep',
		value: -50
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Transaction To Delete A' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Transaction To Delete B' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Transaction To Keep' })).toBeVisible();

	const deleteARow = page.getByRole('row', { name: 'Transaction To Delete A' });
	const deleteBRow = page.getByRole('row', { name: 'Transaction To Delete B' });
	await deleteARow.getByRole('checkbox').check();
	await deleteBRow.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	await page.getByRole('button', { name: 'Delete' }).first().click();

	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByText('2 transactions deleted')).toBeVisible();

	await expect(page).toHaveURL('/transactions');

	await expect(page.getByText('Batch editor')).not.toBeVisible();

	await expect(page.getByRole('row', { name: 'Transaction To Delete A' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Transaction To Delete B' })).not.toBeVisible();

	await expect(page.getByRole('row', { name: 'Transaction To Keep' })).toBeVisible();

	// Test's explicit purpose is direct-URL navigation to the batch editor without a selection
	await page.goto('/transactions/batch');
	await expect(page).toHaveURL('/transactions');
});
