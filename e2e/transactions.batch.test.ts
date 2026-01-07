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

	// Verify all transactions are visible
	await expect(page.getByRole('row', { name: 'Sunrise Bakery' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Coastal Coffee' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Harbor Groceries' })).toBeVisible();

	// Initially no batch editor bar visible
	await expect(page.getByText('Batch editor')).not.toBeVisible();

	// Get checkboxes - header checkbox and row checkboxes
	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	const sunriseRow = page.getByRole('row', { name: 'Sunrise Bakery' });
	const coastalRow = page.getByRole('row', { name: 'Coastal Coffee' });
	const harborRow = page.getByRole('row', { name: 'Harbor Groceries' });

	// Initially all checkboxes are unchecked
	await expect(headerCheckbox).not.toBeChecked();
	await expect(sunriseRow.getByRole('checkbox')).not.toBeChecked();
	await expect(coastalRow.getByRole('checkbox')).not.toBeChecked();
	await expect(harborRow.getByRole('checkbox')).not.toBeChecked();

	// Select first transaction
	await sunriseRow.getByRole('checkbox').check();
	await expect(sunriseRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByText('Batch editor')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Edit 1 transaction' })).toBeVisible();

	// Header checkbox should be indeterminate (partial selection)
	await expect(headerCheckbox).toHaveAttribute('data-state', 'indeterminate');

	// Select second transaction
	await coastalRow.getByRole('checkbox').check();
	await expect(coastalRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	// Header still indeterminate
	await expect(headerCheckbox).toHaveAttribute('data-state', 'indeterminate');

	// Select third transaction (all selected)
	await harborRow.getByRole('checkbox').check();
	await expect(harborRow.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();

	// Header checkbox should now be checked (all selected)
	await expect(headerCheckbox).toBeChecked();

	// Clicking header checkbox when all selected should deselect all
	await headerCheckbox.uncheck();
	await expect(headerCheckbox).not.toBeChecked();
	await expect(sunriseRow.getByRole('checkbox')).not.toBeChecked();
	await expect(coastalRow.getByRole('checkbox')).not.toBeChecked();
	await expect(harborRow.getByRole('checkbox')).not.toBeChecked();
	await expect(page.getByText('Batch editor')).not.toBeVisible();

	// Clicking header checkbox when none selected should select all
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

	// Seed 60 transactions to get 2 pages (50 per page)
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

	// Set period to lifetime to see all transactions
	await page.getByLabel('Period').click();
	await page.getByRole('button', { name: 'Lifetime' }).click();

	// Verify we're on page 1 and have pagination
	await expect(page.getByRole('row', { name: 'Transaction 01' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Go to next page' })).toBeVisible();

	// Select first two transactions on page 1
	const tx01Row = page.getByRole('row', { name: 'Transaction 01' });
	const tx02Row = page.getByRole('row', { name: 'Transaction 02' });
	await tx01Row.getByRole('checkbox').check();
	await tx02Row.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	// Navigate to page 2
	await page.getByRole('button', { name: 'Go to next page' }).click();
	await expect(page.getByRole('row', { name: 'Transaction 51' })).toBeVisible();

	// Selection count should persist
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	// Select one more on page 2
	const tx51Row = page.getByRole('row', { name: 'Transaction 51' });
	await tx51Row.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();

	// Navigate back to page 1
	await page.getByRole('button', { name: 'Go to previous page' }).click();
	await expect(page.getByRole('row', { name: 'Transaction 01' })).toBeVisible();

	// Original selections should still be checked
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

	// Seed 60 transactions to get 2 pages (50 per page)
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

	// Select all on current page using header checkbox
	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 50 transactions' })).toBeVisible();

	// "Select all X results" button should appear when there are more results than selected
	await expect(page.getByRole('button', { name: 'Select all 60 results' })).toBeVisible();

	// Click to select all results across pages
	await page.getByRole('button', { name: 'Select all 60 results' }).click();
	await expect(page.getByRole('link', { name: 'Edit 60 transactions' })).toBeVisible();

	// "Select all" button should no longer be visible since all are selected
	await expect(page.getByRole('button', { name: 'Select all 60 results' })).not.toBeVisible();

	// Navigate to page 2 - all should be selected there too
	await page.getByRole('button', { name: 'Go to next page' }).click();
	await expect(page.getByRole('row', { name: 'Bulk Transaction 51' })).toBeVisible();

	const tx51Row = page.getByRole('row', { name: 'Bulk Transaction 51' });
	const tx60Row = page.getByRole('row', { name: 'Bulk Transaction 60' });
	await expect(tx51Row.getByRole('checkbox')).toBeChecked();
	await expect(tx60Row.getByRole('checkbox')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Edit 60 transactions' })).toBeVisible();

	// Uncheck the header checkbox to deselect all
	await tableHeader.getByRole('checkbox').uncheck();

	// All transactions should be deselected, including those on other pages
	await expect(page.getByRole('link', { name: 'Edit 60 transactions' })).not.toBeVisible();
	await expect(page.getByText('Batch editor')).not.toBeVisible();
	await expect(tx51Row.getByRole('checkbox')).not.toBeChecked();
	await expect(tx60Row.getByRole('checkbox')).not.toBeChecked();

	// Navigate back to page 1 and verify those are also deselected
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

	// Create transactions with different values
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

	// Select all transactions
	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 3 transactions' })).toBeVisible();

	// Click batch editor button to go to batch editor
	await page.getByRole('link', { name: 'Edit 3 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	// Verify page breadcrumb and section heading
	await expect(page.getByLabel('breadcrumb').getByText('Batch editor')).toBeVisible();
	await expect(page.getByText('Update 3 transactions')).toBeVisible();

	// Verify mixed value indicators are shown
	// Account uses a Select component, so it shows text in the trigger button
	await expect(page.getByText('Multiple accounts')).toBeVisible();
	// Text inputs show placeholders
	await expect(page.getByPlaceholder('Multiple descriptions')).toBeVisible();
	await expect(page.getByPlaceholder('Multiple dates')).toBeVisible();
	await expect(page.getByPlaceholder('Multiple labels')).toBeVisible();
	// Multiple amounts shows as disabled input with value text
	await expect(page.getByLabel('Amount')).toHaveValue('Multiple amounts');

	// All inputs should be disabled initially
	await expect(page.getByLabel('Account')).toBeDisabled();
	await expect(page.getByLabel('Description')).toBeDisabled();
	await expect(page.getByLabel('Date')).toBeDisabled();
	await expect(page.getByLabel('Labels')).toBeDisabled();
	await expect(page.getByLabel('Amount')).toBeDisabled();

	// All "Edit" checkboxes should be unchecked
	const editCheckboxes = page.getByRole('checkbox', { name: 'Edit' });
	const checkboxCount = await editCheckboxes.count();
	expect(checkboxCount).toBeGreaterThanOrEqual(5);
	for (let i = 0; i < checkboxCount; i++) {
		await expect(editCheckboxes.nth(i)).not.toBeChecked();
	}

	// Apply button should be disabled (no fields selected for edit)
	await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

	// Discard should be visible as a button
	await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();

	// Danger zone should show correct count
	await expect(page.getByText('Permanently delete all 3 transactions')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();

	// Test discard returns to list without changes
	await page.getByRole('button', { name: 'Discard' }).click();
	await expect(page).toHaveURL('/transactions');

	// All transactions should still exist
	await expect(page.getByRole('row', { name: 'Whole Foods Market' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Target Shopping' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Amazon Purchase' })).toBeVisible();

	// Selection should be cleared
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

	// Create transactions with SAME description, date, account, labels but different amounts
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

	// Select both transactions
	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	// Go to batch editor
	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');
	await expect(page.getByText('Update 2 transactions')).toBeVisible();

	// Account should show common value (not placeholder)
	await expect(page.getByLabel('Account')).toHaveText('Oakwood Checking');
	await expect(page.getByText('Multiple accounts')).not.toBeVisible();

	// Description should show common value
	await expect(page.getByLabel('Description')).toHaveValue('Netflix');
	await expect(page.getByPlaceholder('Multiple descriptions')).not.toBeVisible();

	// Labels should show common value
	await expect(page.getByLabel('Labels')).toHaveValue('Subscriptions');
	await expect(page.getByPlaceholder('Multiple labels')).not.toBeVisible();

	// Amount should show "Multiple amounts" as disabled input value (different values)
	await expect(page.getByLabel('Amount')).toHaveValue('Multiple amounts');

	// Danger zone should show correct count
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

	// Verify original descriptions
	await expect(page.getByRole('row', { name: 'Old Description One' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Old Description Two' })).toBeVisible();

	// Select both transactions
	const tableHeader = page.getByRole('rowgroup').first();
	const headerCheckbox = tableHeader.getByRole('checkbox');
	await headerCheckbox.check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	// Go to batch editor
	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	// Edit checkboxes are in order: Description(0), Amount(1), Date(2), Account(3), Labels(4), Excluded(5)
	const editCheckboxes = page.getByRole('checkbox', { name: 'Edit' });

	// Check "Edit" for description (index 0)
	await editCheckboxes.nth(0).check();

	// Description input should now be enabled
	await expect(page.getByLabel('Description')).toBeEnabled();

	// Enter new description
	await page.getByLabel('Description').fill('Updated Description');

	// Also check "Edit" for labels (index 4) and add labels
	await editCheckboxes.nth(4).check();
	await page.getByLabel('Labels').fill('Utilities, Monthly');

	// Also check "Edit" for account (index 3) and change it
	await editCheckboxes.nth(3).check();
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Lakeside Savings' }).click();

	// Apply button should now be enabled
	await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();

	// Click Apply
	await page.getByRole('button', { name: 'Apply' }).click();

	// Should show success toast
	await expect(page.getByText('2 transactions updated')).toBeVisible();

	// Should redirect back to transactions list
	await expect(page).toHaveURL('/transactions');

	// Selection should be cleared
	await expect(page.getByText('Batch editor')).not.toBeVisible();

	// Both transactions should have new description
	await expect(page.getByRole('row', { name: 'Old Description One' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Old Description Two' })).not.toBeVisible();

	const updatedRow1 = page.getByRole('row', { name: 'Updated Description' }).first();
	const updatedRow2 = page.getByRole('row', { name: 'Updated Description' }).nth(1);
	await expect(updatedRow1).toBeVisible();
	await expect(updatedRow2).toBeVisible();

	// Both should have new labels
	await expect(updatedRow1.getByText('Monthly')).toBeVisible();
	await expect(updatedRow1.getByText('Utilities')).toBeVisible();
	await expect(updatedRow2.getByText('Monthly')).toBeVisible();
	await expect(updatedRow2.getByText('Utilities')).toBeVisible();

	// Both should have new account
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

	// Verify all transactions exist
	await expect(page.getByRole('row', { name: 'Transaction To Delete A' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Transaction To Delete B' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Transaction To Keep' })).toBeVisible();

	// Select only the two to delete (not the one to keep)
	const deleteARow = page.getByRole('row', { name: 'Transaction To Delete A' });
	const deleteBRow = page.getByRole('row', { name: 'Transaction To Delete B' });
	await deleteARow.getByRole('checkbox').check();
	await deleteBRow.getByRole('checkbox').check();
	await expect(page.getByRole('link', { name: 'Edit 2 transactions' })).toBeVisible();

	// Go to batch editor
	await page.getByRole('link', { name: 'Edit 2 transactions' }).click();
	await expect(page).toHaveURL('/transactions/batch');

	// Click Delete in danger zone (first button is the trigger, second is in the dialog)
	await page.getByRole('button', { name: 'Delete' }).first().click();

	// Confirmation dialog should appear
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	// Confirm deletion
	await dialog.getByRole('button', { name: 'Continue' }).click();

	// Should show success toast
	await expect(page.getByText('2 transactions deleted')).toBeVisible();

	// Should redirect back to transactions list
	await expect(page).toHaveURL('/transactions');

	// Selection should be cleared
	await expect(page.getByText('Batch editor')).not.toBeVisible();

	// Deleted transactions should be gone
	await expect(page.getByRole('row', { name: 'Transaction To Delete A' })).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Transaction To Delete B' })).not.toBeVisible();

	// Kept transaction should still exist
	await expect(page.getByRole('row', { name: 'Transaction To Keep' })).toBeVisible();

	// Also test: navigating directly to batch editor without selection should redirect
	await page.goto('/transactions/batch');
	await expect(page).toHaveURL('/transactions');
});
