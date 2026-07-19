import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import { goToEditTab, goToPageViaSidebar, goToRecordDetail, signIn } from './playwright.helpers';
import {
	recordExists,
	seedAccount,
	seedAccountBalance,
	seedCurrency,
	seedPortfolio,
	seedSecurity,
	seedSecurityBalance,
	seedTrade,
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
		asOf: '2025-01-01T00:00:00.000Z',
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
	await seedAccount({
		name: 'Idle Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
	await expect(page).toHaveTitle('Accounts · Canutin');

	const openRow = page.getByRole('row', { name: /Daily Checking/ });
	await expect(openRow).toBeVisible();

	const openCells = openRow.locator('td');
	await expect(openCells.nth(6)).toContainText('$2,500.00');
	await expect(openCells.nth(5)).toHaveText('3');
	await expect(openRow.getByText('Excluded')).not.toBeVisible();
	await expect(page.getByRole('row', { name: 'Idle Checking' }).locator('td').nth(5)).toHaveText(
		'0'
	);

	const excludedRow = page.getByRole('row', { name: /Sandbox Account/ });
	await expect(excludedRow).toBeVisible();

	const excludedCells = excludedRow.locator('td');
	await expect(excludedCells.nth(6)).toContainText('$1,000.00');
	await expect(excludedRow.getByText('Excluded')).toBeVisible();
	await expect(excludedCells.nth(5)).toHaveText('~');

	const aggregateRow = page.getByRole('region', { name: 'Net balance' });
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

	await page.getByRole('tab', { name: 'Open' }).click();
	const openBalanceCell = openRow.locator('td').nth(6);
	await expect(openBalanceCell).toContainText('$2,500.00');
	await expect(aggregateRow).toContainText('$2,500.00');

	await seedAccountBalance({
		account: openAccount.id,
		owner: user.id,
		asOf: '2025-02-01T00:00:00.000Z',
		value: 7777
	});
	await expect(openBalanceCell).toContainText('$7,777.00');
	await expect(aggregateRow).toContainText('$7,777.00');

	await seedAccountBalance({
		account: openAccount.id,
		owner: user.id,
		asOf: '2024-12-01T00:00:00.000Z',
		value: 3333
	});
	await expect(openBalanceCell).toContainText('$7,777.00');
	await expect(aggregateRow).toContainText('$7,777.00');
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
	await page.getByLabel('Notes').fill('Opened in 2024 for emergency fund');
	await page.getByLabel('Balance', { exact: true }).fill('5000');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Account added')).toBeVisible();
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
	await page.getByLabel('Balance', { exact: true }).fill('-1200');
	await expect(page.getByText('Account added')).not.toBeVisible();

	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Account added')).toBeVisible();
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
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));
	await expect(page).toHaveTitle('Primary Checking · Accounts · Canutin');

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}/edit`));
	await expect(page).toHaveTitle('Edit · Primary Checking · Accounts · Canutin');
	await expect(page.getByLabel('Name')).toHaveValue('Primary Checking');
	await expect(page.getByLabel('Institution')).toHaveValue('Bank of America');
	await expect(page.getByLabel('Category')).toHaveValue('Checking');
	await expect(page.getByLabel('Notes')).toHaveValue('');

	await page.getByLabel('Name').fill('Business Checking');
	await page.getByLabel('Institution').fill('Wells Fargo');
	await page.getByLabel('Category').fill('Checking');
	await page.getByLabel('Balance group').click();
	await page.getByRole('option', { name: 'Cash' }).click();
	await page.getByLabel('Notes').fill('Switched from BoA after the move');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Account updated')).toBeVisible();
	await expect(
		page.getByText(
			'This account has been updated elsewhere and your changes may be based on outdated data'
		)
	).not.toBeVisible();
	await expect(page).toHaveURL('/accounts');
	await expect(page.getByRole('row', { name: 'Primary Checking' })).not.toBeVisible();

	const renamedRow = page.getByRole('row', { name: 'Business Checking' });
	await expect(renamedRow).toBeVisible();

	const renamedCells = renamedRow.locator('td');
	await expect(renamedCells.nth(0)).toContainText('Business Checking');
	await expect(renamedCells.nth(1)).toContainText('Wells Fargo');
	await expect(renamedCells.nth(3)).toContainText('Checking');
	await expect(renamedCells.nth(6)).toContainText('$3,000.00');

	await renamedRow.getByRole('link', { name: 'Business Checking' }).click();
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}/edit`));
	await expect(page.getByLabel('Name')).toHaveValue('Business Checking');
	await expect(page.getByLabel('Institution')).toHaveValue('Wells Fargo');
	await expect(page.getByLabel('Category')).toHaveValue('Checking');
	await expect(page.getByLabel('Balance group')).toHaveText('Cash');
	await expect(page.getByLabel('Notes')).toHaveValue('Switched from BoA after the move');
	await expect(page.getByLabel('Exclude from net worth')).not.toBeChecked();

	await page.getByLabel('Balance', { exact: true }).fill('4500');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Balance updated')).toBeVisible();
	await expect(page).toHaveURL('/accounts');
	await expect(
		page.getByRole('row', { name: 'Business Checking' }).locator('td').nth(6)
	).toContainText('$4,500.00');

	await page.getByRole('row', { name: 'Business Checking' }).getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}/edit`));

	await page.getByLabel('Exclude from net worth').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Account updated').first()).toBeVisible();
	await expect(page).toHaveURL('/accounts');

	await page.getByRole('row', { name: 'Business Checking' }).getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}/edit`));
	await expect(page.getByLabel('Exclude from net worth')).toBeChecked();

	await page.getByLabel('Exclude from net worth').uncheck();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Account updated').first()).toBeVisible();
	await expect(page).toHaveURL('/accounts');

	await page.getByRole('row', { name: 'Business Checking' }).getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}/edit`));
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

	// Test's explicit purpose is direct-URL navigation to the edit page
	await page.goto(`/accounts/${savingsAccount.id}/edit`);
	await expect(page).toHaveURL(`/accounts/${savingsAccount.id}/edit`);
	await expect(page.getByLabel('Name')).toHaveValue('Emergency Fund');
	await expect(page.getByLabel('Institution')).toHaveValue('Ally Bank');
	await expect(page.getByLabel('Category')).toHaveValue('Savings');
	await expect(page.getByLabel('Balance', { exact: true })).toHaveValue('$10,000.00');
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
	await expect(page).toHaveURL(new RegExp(`/accounts/${investmentAccount.id}(\\?|$)`));

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${investmentAccount.id}/edit`));
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
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}/edit`));

	await page.getByRole('button', { name: 'Delete' }).first().click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	await dialog.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Account deleted')).toBeVisible();
	await expect(page).toHaveURL('/accounts');
	await expect(page.getByRole('row', { name: 'Old Checking' })).not.toBeVisible();
	expect(await recordExists('accounts', checkingAccount.id)).toBe(false);
	expect(await recordExists('accountBalances', balance.id)).toBe(false);
	expect(await recordExists('transactions', transaction1.id)).toBe(false);
	expect(await recordExists('transactions', transaction2.id)).toBe(false);
});

test('account overview keeps the balance history section and swaps its empty state for a chart', async ({
	page
}) => {
	const user = await seedUser('winona');

	const account = await seedAccount({
		name: 'Growth Savings',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: '2025-01-01T00:00:00.000Z',
		value: 1000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Growth Savings');
	await expect(page.getByRole('heading', { name: 'Balance history' })).toBeVisible();
	await expect(page.getByText('No balance history yet')).toBeVisible();

	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: '2025-02-01T00:00:00.000Z',
		value: 2000
	});
	await expect(page.getByText('No balance history yet')).not.toBeVisible();
	await expect(page.getByRole('img', { name: 'Balance' })).toBeVisible();

	// Drag across the chart from the first balance point to the second to compare them
	const chartBox = await page.getByRole('img', { name: 'Balance' }).boundingBox();
	if (!chartBox) throw new Error('Balance history chart has no bounding box');
	const chartMiddleY = chartBox.y + chartBox.height / 2;
	await page.mouse.move(chartBox.x + chartBox.width * 0.25, chartMiddleY);
	await page.mouse.down();
	await page.mouse.move(chartBox.x + chartBox.width * 0.75, chartMiddleY, { steps: 5 });
	await expect(page.getByText('2025-01-01 → 2025-02-01')).toBeVisible();
	await expect(page.getByText('+$1,000.00')).toBeVisible();
	await expect(page.getByText('+100.0%')).toBeVisible();

	// Releasing restores the regular single-point tooltip
	await page.mouse.up();
	await expect(page.getByText('2025-01-01 → 2025-02-01')).not.toBeVisible();
	await expect(page.getByText('Balance', { exact: true })).toBeVisible();

	// The chart's period tabs window the series: both balances predate the 3M window, so it
	// swaps to the period empty state; MAX restores the full series
	await expect(page.locator('[data-chart-period="max"]')).toBeVisible();
	await page
		.getByRole('tablist', { name: 'Balance history period' })
		.getByRole('tab', { name: '3M' })
		.click();
	await expect(page.getByText('No data in this period')).toBeVisible();
	await page
		.getByRole('tablist', { name: 'Balance history period' })
		.getByRole('tab', { name: 'MAX' })
		.click();
	await expect(page.getByRole('img', { name: 'Balance' })).toBeVisible();
});

test('account overview charts an auto-calculated account from its transaction history', async ({
	page
}) => {
	const user = await seedUser('wilbur');

	const account = await seedAccount({
		name: 'Auto Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-01-01T00:00:00.000Z',
		description: 'Opening deposit',
		value: 500
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: '2025-02-01T00:00:00.000Z',
		description: 'Paycheck',
		value: 750
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Auto Checking');
	await expect(page.getByRole('heading', { name: 'Balance history' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Balance' })).toBeVisible();
});

test('account overview charts an investment account from its security positions', async ({
	page
}) => {
	const user = await seedUser('phoebe');

	const brokerage = await seedAccount({
		name: 'Index Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Globex Fund', symbol: 'GLBX', owner: user.id });
	await seedSecurityBalance({
		account: brokerage.id,
		owner: user.id,
		security: security.id,
		asOf: '2025-01-01T00:00:00.000Z',
		quantity: 10,
		price: 100,
		value: 1000
	});
	await seedSecurityBalance({
		account: brokerage.id,
		owner: user.id,
		security: security.id,
		asOf: '2025-02-01T00:00:00.000Z',
		quantity: 12,
		price: 150,
		value: 1800
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Index Brokerage');
	await expect(page.getByRole('img', { name: 'Balance' })).toBeVisible();
});

test('account overview blanks the balance history when it holds a foreign-currency security', async ({
	page
}) => {
	const user = await seedUser('sabine');
	await seedCurrency({ owner: user.id, code: 'EUR', name: 'Euro', autoUpdate: false });

	const brokerage = await seedAccount({
		name: 'Euro Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage',
		currency: 'EUR'
	});
	const security = await seedSecurity({ name: 'Dollar Fund', symbol: 'USDF', owner: user.id });
	await seedSecurityBalance({
		account: brokerage.id,
		owner: user.id,
		security: security.id,
		asOf: '2025-01-01T00:00:00.000Z',
		quantity: 10,
		price: 100,
		value: 1000
	});
	await seedSecurityBalance({
		account: brokerage.id,
		owner: user.id,
		security: security.id,
		asOf: '2025-02-01T00:00:00.000Z',
		quantity: 12,
		price: 150,
		value: 1800
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Euro Brokerage');
	await expect(page.getByText('No balance history yet')).toBeVisible();
	await expect(page.getByRole('img', { name: 'Balance' })).not.toBeVisible();
});

test('account overview samples transactions and trades with links to filtered ledgers', async ({
	page
}) => {
	const user = await seedUser('nova');

	const brokerage = await seedAccount({
		name: 'Brokerage One',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Investment'
	});
	const security = await seedSecurity({ name: 'Acme Corp', symbol: 'ACME', owner: user.id });
	await seedTransaction({
		account: brokerage.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Dividend payout',
		value: 120
	});
	await seedTrade({
		account: brokerage.id,
		owner: user.id,
		security: security.id,
		date: new Date().toISOString(),
		type: SecurityTransactionsTypeOptions.buy,
		description: 'Bought Acme',
		quantity: 5,
		price: 100,
		amount: -500
	});

	await seedAccount({
		name: 'Empty Vault',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Brokerage One');
	await expect(page.getByText('Dividend payout')).toBeVisible();
	await expect(page.getByText('Bought Acme')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Recent trades' })).toBeVisible();

	const brokeragePositions = await page
		.getByRole('heading', { name: 'Top positions' })
		.boundingBox();
	const brokerageCashflow = await page
		.getByRole('heading', { name: 'Trailing cashflow' })
		.boundingBox();
	expect(brokeragePositions).not.toBeNull();
	expect(brokerageCashflow).not.toBeNull();
	expect(brokeragePositions!.y).toBeLessThan(brokerageCashflow!.y);

	await page.getByRole('link', { name: 'View all 1 transaction' }).click();
	await expect(page).toHaveURL(new RegExp(`account=${brokerage.id}`));
	await expect(page.getByText('Dividend payout')).toBeVisible();

	await goToRecordDetail(page, 'Accounts', 'Brokerage One');
	await page.getByRole('link', { name: 'View all 1 trade' }).click();
	await expect(page).toHaveURL(new RegExp(`account=${brokerage.id}`));
	await expect(page.getByText('Bought Acme')).toBeVisible();

	await goToRecordDetail(page, 'Accounts', 'Empty Vault');
	await expect(page.getByText('No transactions yet')).toBeVisible();
	await expect(page.getByText('No trades yet')).toBeVisible();
	await expect(page.getByRole('link', { name: /View all/ })).not.toBeVisible();

	const emptyAccountPositions = await page
		.getByRole('heading', { name: 'Top positions' })
		.boundingBox();
	const emptyAccountCashflow = await page
		.getByRole('heading', { name: 'Trailing cashflow' })
		.boundingBox();
	expect(emptyAccountPositions).not.toBeNull();
	expect(emptyAccountCashflow).not.toBeNull();
	expect(emptyAccountCashflow!.y).toBeLessThan(emptyAccountPositions!.y);
});

test('account overview caps top positions at five and links to the filtered portfolio', async ({
	page
}) => {
	const user = await seedUser('dorian');
	const securities = Array.from({ length: 6 }, (_, index) => ({
		name: `Position ${index + 1}`,
		symbol: `P${index + 1}`
	}));
	const {
		accounts: [account]
	} = await seedPortfolio(user.id, {
		accounts: ['Focused Brokerage'],
		securities,
		balances: securities.map((security, index) => ({
			account: 'Focused Brokerage',
			security: security.name,
			quantity: index + 1,
			price: 100,
			value: (index + 1) * 100,
			costBasis: (index + 1) * 80
		}))
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Focused Brokerage');

	const positionsTable = page.getByRole('table').first();
	await expect(positionsTable.getByRole('row')).toHaveCount(6);
	await expect(positionsTable.getByRole('row', { name: /Position 6/ })).toBeVisible();
	await expect(positionsTable.getByRole('row', { name: /Position 1/ })).not.toBeVisible();

	const viewAll = page.getByRole('link', { name: 'View all 6 positions' });
	await expect(viewAll).toHaveAttribute('href', `/portfolio?account=${account.id}`);
});
