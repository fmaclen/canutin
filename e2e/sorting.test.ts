import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedSecurity,
	seedSecurityBalance,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

// --- accounts list ---

test('accounts list: clicking Balance header sorts by balance descending then ascending', async ({
	page
}) => {
	const user = await seedUser('abigail');

	await seedAccount({
		name: 'Low Balance Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 100
		})
	);

	await seedAccount({
		name: 'High Balance Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 5000
		})
	);

	await seedAccount({
		name: 'Mid Balance Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 1000
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'High Balance Account' })).toBeVisible();

	const rows = page.locator('tbody tr');

	// Default sort is balance DESC (highest first)
	expect(await getRowIndex(rows, 'High Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Mid Balance Account')
	);
	expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Low Balance Account')
	);

	// Click Balance header - default is already Balance DESC, so clicking toggles to ASC
	const balanceHeader = page.getByRole('button', { name: 'Balance' });
	await balanceHeader.click();
	await expect(page).toHaveURL(/sort=balance/);
	await expect(page).toHaveURL(/dir=asc/);

	// Verify order is now ascending (lowest first)
	expect(await getRowIndex(rows, 'Low Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Mid Balance Account')
	);
	expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'High Balance Account')
	);

	// Click again - should toggle back to DESC
	await balanceHeader.click();
	await expect(page).toHaveURL(/dir=desc/);

	// Verify order is back to descending (highest first)
	expect(await getRowIndex(rows, 'High Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Mid Balance Account')
	);
	expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
		await getRowIndex(rows, 'Low Balance Account')
	);
});

test('accounts list: clicking Account header sorts alphabetically', async ({ page }) => {
	const user = await seedUser('barry');

	await seedAccount({
		name: 'Zebra Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 500
		})
	);

	await seedAccount({
		name: 'Alpha Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 500
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'Zebra Account' })).toBeVisible();

	const rows = page.locator('tbody tr');

	// Click Account header - first click should sort DESC (Z first)
	const accountHeader = page.getByRole('button', { name: 'Account', exact: true });
	await accountHeader.click();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Zebra Account')).toBeLessThan(
		await getRowIndex(rows, 'Alpha Account')
	);

	// Click again - should toggle to ASC (A first)
	await accountHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Alpha Account')).toBeLessThan(
		await getRowIndex(rows, 'Zebra Account')
	);
});

test('accounts list: clicking Institution header sorts by institution', async ({ page }) => {
	const user = await seedUser('candice');

	await seedAccount({
		name: 'Chase Checking',
		institution: 'Chase Bank',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 1000
		})
	);

	await seedAccount({
		name: 'Wells Fargo Savings',
		institution: 'Wells Fargo',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 2000
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'Chase Checking' })).toBeVisible();

	// Click Institution header
	const institutionHeader = page.getByRole('button', { name: 'Institution' });
	await institutionHeader.click();

	await expect(page).toHaveURL(/sort=institution/);
	await expect(page).toHaveURL(/dir=desc/);

	// Click again - toggle to ASC
	await institutionHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
});

test('accounts list: clicking Transactions header sorts by transaction count', async ({ page }) => {
	const user = await seedUser('derek');

	const manyTx = await seedAccount({
		name: 'Many Transactions',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: manyTx.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});
	for (let i = 0; i < 5; i++) {
		await seedTransaction({
			account: manyTx.id,
			owner: user.id,
			date: new Date().toISOString(),
			description: `Transaction ${i}`,
			value: 100
		});
	}

	const fewTx = await seedAccount({
		name: 'Few Transactions',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: fewTx.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2000
	});
	await seedTransaction({
		account: fewTx.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Single transaction',
		value: 50
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'Many Transactions' })).toBeVisible();

	const rows = page.locator('tbody tr');

	// Click Transactions header - DESC first (most transactions first)
	const txHeader = page.getByRole('button', { name: 'Transactions' });
	await txHeader.click();

	await expect(page).toHaveURL(/sort=transactions/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Many Transactions')).toBeLessThan(
		await getRowIndex(rows, 'Few Transactions')
	);

	// Click again - ASC (fewest first)
	await txHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Few Transactions')).toBeLessThan(
		await getRowIndex(rows, 'Many Transactions')
	);
});

test('accounts list: sort state persists in URL and survives page reload', async ({ page }) => {
	const user = await seedUser('emma');

	await seedAccount({
		name: 'Account One',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 1000
		})
	);

	await seedAccount({
		name: 'Account Two',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 2000
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'Account One' })).toBeVisible();

	// Sort by name ASC
	const accountHeader = page.getByRole('button', { name: 'Account', exact: true });
	await accountHeader.click(); // DESC
	await accountHeader.click(); // ASC

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	const rows = page.locator('tbody tr');

	expect(await getRowIndex(rows, 'Account One')).toBeLessThan(
		await getRowIndex(rows, 'Account Two')
	);

	// Reload page
	await page.reload();

	// Sort state should persist
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(page.getByRole('row', { name: 'Account One' })).toBeVisible();
	expect(await getRowIndex(rows, 'Account One')).toBeLessThan(
		await getRowIndex(rows, 'Account Two')
	);
});

test('accounts list: sort indicator shows on active column', async ({ page }) => {
	const user = await seedUser('felix');

	await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 1000
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'Test Account' })).toBeVisible();

	// Default sort is Balance DESC - the th parent should have aria-sort
	const balanceButton = page.getByRole('button', { name: 'Balance' });
	const balanceTh = balanceButton.locator('xpath=..');
	await expect(balanceTh).toHaveAttribute('aria-sort', 'descending');

	// Click once to toggle to ASC
	await balanceButton.click();
	await expect(balanceTh).toHaveAttribute('aria-sort', 'ascending');

	// Click different column - Balance th should lose aria-sort
	const accountButton = page.getByRole('button', { name: 'Account', exact: true });
	const accountTh = accountButton.locator('xpath=..');
	await accountButton.click();

	await expect(accountTh).toHaveAttribute('aria-sort', 'descending');
	await expect(balanceTh).not.toHaveAttribute('aria-sort');
});

test('accounts list: sorting works correctly across filter tabs', async ({ page }) => {
	const user = await seedUser('gloria');

	await seedAccount({
		name: 'Open Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 3000
		})
	);

	await seedAccount({
		name: 'Closed Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings',
		closed: new Date().toISOString()
	}).then((acc) =>
		seedAccountBalance({
			account: acc.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 1000
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

	await expect(page.getByRole('row', { name: 'Open Account' })).toBeVisible();

	// Sort by name ASC
	const accountHeader = page.getByRole('button', { name: 'Account', exact: true });
	await accountHeader.click(); // DESC
	await accountHeader.click(); // ASC

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	// Switch to All tab - sorting should persist
	await page.getByRole('tab', { name: 'All' }).click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	const rows = page.locator('tbody tr');

	// C comes before O alphabetically
	expect(await getRowIndex(rows, 'Closed Account')).toBeLessThan(
		await getRowIndex(rows, 'Open Account')
	);
});

// --- account positions ---

test('account positions: positions table sorts by column with order, aria-sort, and URL reflecting the active sort', async ({
	page
}) => {
	const user = await seedUser('helena');
	const account = await seedAccount({
		name: 'Helena Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Position', symbol: 'ALP', owner: user.id });
	const beta = await seedSecurity({ name: 'Beta Position', symbol: 'BET', owner: user.id });
	const gamma = await seedSecurity({ name: 'Gamma Position', symbol: 'GAM', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: beta.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: gamma.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/accounts/${account.id}`);
	await expect(page.getByRole('row', { name: /Beta Position/ })).toBeVisible();

	const table = page.getByRole('table');
	const rows = table.getByRole('row');

	// Default sort is value DESC
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

	// Security header sorts by name DESC first, then ASC
	const securityButton = table.getByRole('button', { name: 'Security', exact: true });
	const securityHeader = securityButton.locator('xpath=..');
	const marketValueButton = table.getByRole('button', { name: 'Market value', exact: true });
	const marketValueHeader = marketValueButton.locator('xpath=..');
	await securityButton.click();
	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(securityHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(marketValueHeader).not.toHaveAttribute('aria-sort');
	await expect(rows.nth(1)).toContainText('Gamma Position');
	await expect(rows.nth(2)).toContainText('Beta Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

	await securityButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
	await expect(rows.nth(2)).toContainText('Beta Position');
	await expect(rows.nth(3)).toContainText('Gamma Position');

	// Market value header sorts by value DESC first (switching from the security column)
	await marketValueButton.click();
	await expect(page).toHaveURL(/sort=value/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

	// Clicking it again toggles to value ASC
	await marketValueButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Beta Position');

	// Gain/loss header sorts by gain amount DESC first
	await table.getByRole('button', { name: 'Gain/loss', exact: true }).click();
	await expect(page).toHaveURL(/sort=gainLoss/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Alpha Position');
	await expect(rows.nth(3)).toContainText('Gamma Position');

	// Sort state survives a reload
	await securityButton.click();
	await securityButton.click();
	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
});

// --- assets ---

test('assets: clicking Market Value header sorts by market value descending then ascending', async ({
	page
}) => {
	const user = await seedUser('harris');

	const lowValue = await seedAsset({
		name: 'Low Value Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: lowValue.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1000
	});

	const highValue = await seedAsset({
		name: 'High Value Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'ETFs'
	});
	await seedAssetBalance({
		asset: highValue.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 50000
	});

	const midValue = await seedAsset({
		name: 'Mid Value Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Bonds'
	});
	await seedAssetBalance({
		asset: midValue.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Value Asset' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	expect(await getRowIndex(rows, 'High Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Low Value Asset')
	);

	const marketValueHeader = page.getByRole('button', { name: 'Market Value' });
	await marketValueHeader.click();

	await expect(page).toHaveURL(/sort=marketValue/);
	await expect(page).toHaveURL(/dir=asc/);

	expect(await getRowIndex(rows, 'Low Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'High Value Asset')
	);

	await marketValueHeader.click();
	await expect(page).toHaveURL(/dir=desc/);

	expect(await getRowIndex(rows, 'High Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Mid Value Asset')
	);
	expect(await getRowIndex(rows, 'Mid Value Asset')).toBeLessThan(
		await getRowIndex(rows, 'Low Value Asset')
	);
});

test('assets: clicking Asset header sorts alphabetically', async ({ page }) => {
	const user = await seedUser('ingrid');

	const zAsset = await seedAsset({
		name: 'Zebra Corp',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: zAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	const aAsset = await seedAsset({
		name: 'Alpha Inc',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: aAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Zebra Corp' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	const assetHeader = page.getByRole('button', { name: 'Asset', exact: true });
	await assetHeader.click();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Zebra Corp')).toBeLessThan(await getRowIndex(rows, 'Alpha Inc'));

	await assetHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Alpha Inc')).toBeLessThan(await getRowIndex(rows, 'Zebra Corp'));
});

test('assets: clicking Book Value header sorts by book value', async ({ page }) => {
	const user = await seedUser('kendall');

	const lowCost = await seedAsset({
		name: 'Low Cost Basis',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: lowCost.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 1000,
		marketValue: 2000
	});

	const highCost = await seedAsset({
		name: 'High Cost Basis',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: highCost.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 50000,
		marketValue: 45000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Cost Basis' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	const bookValueHeader = page.getByRole('button', { name: 'Book Value' });
	await bookValueHeader.click();

	await expect(page).toHaveURL(/sort=bookValue/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'High Cost Basis')).toBeLessThan(
		await getRowIndex(rows, 'Low Cost Basis')
	);

	await bookValueHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Low Cost Basis')).toBeLessThan(
		await getRowIndex(rows, 'High Cost Basis')
	);
});

test('assets: clicking Gain/Loss header sorts by gain amount', async ({ page }) => {
	const user = await seedUser('logan');

	const bigGain = await seedAsset({
		name: 'Big Winner',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: bigGain.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 10000,
		marketValue: 50000
	});

	const bigLoss = await seedAsset({
		name: 'Big Loser',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: bigLoss.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 30000,
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Big Winner' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	const gainHeader = page.getByRole('button', { name: 'Gain/Loss' });
	await gainHeader.click();

	await expect(page).toHaveURL(/sort=gain/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Big Winner')).toBeLessThan(await getRowIndex(rows, 'Big Loser'));

	await gainHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Big Loser')).toBeLessThan(await getRowIndex(rows, 'Big Winner'));
});

test('assets: clicking Gain % header sorts by gain percentage', async ({ page }) => {
	const user = await seedUser('melinda');

	const highPercent = await seedAsset({
		name: 'High Percent Gain',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: highPercent.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 1000,
		marketValue: 10000
	});

	const lowPercent = await seedAsset({
		name: 'Low Percent Gain',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: lowPercent.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		bookValue: 9000,
		marketValue: 10000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'High Percent Gain' })).toBeVisible();

	const rows = page.locator('[data-slot="table-body"] tr');

	const gainPercentHeader = page.getByRole('button', { name: 'Gain %' });
	await gainPercentHeader.click();

	await expect(page).toHaveURL(/sort=gainPercent/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'High Percent Gain')).toBeLessThan(
		await getRowIndex(rows, 'Low Percent Gain')
	);

	await gainPercentHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Low Percent Gain')).toBeLessThan(
		await getRowIndex(rows, 'High Percent Gain')
	);
});

test('assets: sort state persists in URL and survives page reload', async ({ page }) => {
	const user = await seedUser('nolan');

	const asset = await seedAsset({
		name: 'Test Asset',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Test Asset' })).toBeVisible();

	const assetHeader = page.getByRole('button', { name: 'Asset', exact: true });
	await assetHeader.click();
	await assetHeader.click();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);
});

test('assets: sort indicator shows on active column', async ({ page }) => {
	const user = await seedUser('oscar');

	const asset = await seedAsset({
		name: 'Test Asset For Sorting',
		balanceGroup: AssetsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Stocks'
	});
	await seedAssetBalance({
		asset: asset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('tab', { name: 'Owned' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('row', { name: 'Test Asset For Sorting' })).toBeVisible();

	const marketValueButton = page.getByRole('button', { name: 'Market Value' });
	const marketValueHeader = marketValueButton.locator('xpath=..');
	await marketValueButton.click();

	await expect(marketValueHeader).toHaveAttribute('aria-sort', 'ascending');

	await marketValueButton.click();
	await expect(marketValueHeader).toHaveAttribute('aria-sort', 'descending');

	const assetButton = page.getByRole('button', { name: 'Asset', exact: true });
	const assetHeader = assetButton.locator('xpath=..');
	await assetButton.click();

	await expect(assetHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(marketValueHeader).not.toHaveAttribute('aria-sort');
});

// --- transactions ---

test('transactions: clicking Date header sorts by date descending then ascending', async ({
	page
}) => {
	const user = await seedUser('parker');

	const account = await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const now = new UTCDate();
	const oldDate = setHours(subDays(now, 30), 12);
	const midDate = setHours(subDays(now, 15), 12);
	const recentDate = setHours(subDays(now, 1), 12);

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: oldDate.toISOString(),
		description: 'Old Transaction',
		value: 100
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: midDate.toISOString(),
		description: 'Mid Transaction',
		value: 200
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: recentDate.toISOString(),
		description: 'Recent Transaction',
		value: 300
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Recent Transaction' })).toBeVisible();

	const rows = page.locator('tbody tr');

	// Default sort is date DESC (most recent first)
	expect(await getRowIndex(rows, 'Recent Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Mid Transaction')
	);
	expect(await getRowIndex(rows, 'Mid Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Old Transaction')
	);

	// Click Date header - default is already DESC, so clicking toggles to ASC
	const dateHeader = page.getByRole('button', { name: 'Date' });
	await dateHeader.click();

	await expect(page).toHaveURL(/sort=date/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.first()).toContainText('Old Transaction');

	expect(await getRowIndex(rows, 'Old Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Mid Transaction')
	);
	expect(await getRowIndex(rows, 'Mid Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Recent Transaction')
	);

	// Click again - should toggle back to DESC
	await dateHeader.click();
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.first()).toContainText('Recent Transaction');

	expect(await getRowIndex(rows, 'Recent Transaction')).toBeLessThan(
		await getRowIndex(rows, 'Mid Transaction')
	);
});

test('transactions: clicking Description header sorts alphabetically', async ({ page }) => {
	const user = await seedUser('reginald');

	const account = await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Zebra Store',
		value: 100
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Apple Purchase',
		value: 200
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Middle Shop',
		value: 300
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Zebra Store' })).toBeVisible();

	const rows = page.locator('tbody tr');

	const descriptionHeader = page.getByRole('button', { name: 'Description' });
	await descriptionHeader.click();

	await expect(page).toHaveURL(/sort=description/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.first()).toContainText('Zebra Store');
	expect(await getRowIndex(rows, 'Zebra Store')).toBeLessThan(
		await getRowIndex(rows, 'Apple Purchase')
	);

	await descriptionHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.first()).toContainText('Apple Purchase');
	expect(await getRowIndex(rows, 'Apple Purchase')).toBeLessThan(
		await getRowIndex(rows, 'Zebra Store')
	);
});

test('transactions: clicking Account header sorts by account name', async ({ page }) => {
	const user = await seedUser('serena');

	const account1 = await seedAccount({
		name: 'Alpha Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account1.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const account2 = await seedAccount({
		name: 'Zeta Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});
	await seedAccountBalance({
		account: account2.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 5000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account1.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Transaction A',
		value: 100
	});
	await seedTransaction({
		account: account2.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Transaction Z',
		value: 200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Transaction A' })).toBeVisible();

	const rows = page.locator('tbody tr');

	const accountHeader = page.locator('thead').getByRole('button', { name: 'Account' });
	await accountHeader.click();

	await expect(page).toHaveURL(/sort=account/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.first()).toContainText('Zeta Account');
	expect(await getRowIndex(rows, 'Zeta Account')).toBeLessThan(
		await getRowIndex(rows, 'Alpha Account')
	);

	await accountHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.first()).toContainText('Alpha Account');
	expect(await getRowIndex(rows, 'Alpha Account')).toBeLessThan(
		await getRowIndex(rows, 'Zeta Account')
	);
});

test('transactions: clicking Amount header sorts by amount descending then ascending', async ({
	page
}) => {
	const user = await seedUser('terrence');

	const account = await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Small Credit',
		value: 50
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Large Credit',
		value: 5000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Small Debit',
		value: -25
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Large Debit',
		value: -500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Large Credit' })).toBeVisible();

	const rows = page.locator('tbody tr');

	const amountHeader = page.getByRole('button', { name: 'Amount' });
	await amountHeader.click();

	await expect(page).toHaveURL(/sort=amount/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Large Credit')).toBeLessThan(
		await getRowIndex(rows, 'Large Debit')
	);

	await amountHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Large Debit')).toBeLessThan(
		await getRowIndex(rows, 'Large Credit')
	);
});

test('transactions: sort state persists in URL and survives page reload', async ({ page }) => {
	const user = await seedUser('ulysses');

	const account = await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Test Transaction',
		value: 100
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Test Transaction' })).toBeVisible();

	const amountHeader = page.getByRole('button', { name: 'Amount' });
	await amountHeader.click();
	await amountHeader.click();

	await expect(page).toHaveURL(/sort=amount/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=amount/);
	await expect(page).toHaveURL(/dir=asc/);
});

test('transactions: sort indicator shows on active column', async ({ page }) => {
	const user = await seedUser('vernon');

	const account = await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Test Transaction',
		value: 100
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Test Transaction' })).toBeVisible();

	const amountButton = page.getByRole('button', { name: 'Amount' });
	const amountHeader = amountButton.locator('xpath=..');
	await amountButton.click();

	await expect(amountHeader).toHaveAttribute('aria-sort', 'descending');

	await amountButton.click();
	await expect(amountHeader).toHaveAttribute('aria-sort', 'ascending');

	// Click Date header - Date is default column, but we switched away, so clicking goes to DESC
	const dateButton = page.getByRole('button', { name: 'Date' });
	const dateHeader = dateButton.locator('xpath=..');
	await dateButton.click();

	await expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(amountHeader).not.toHaveAttribute('aria-sort');
});

test('transactions: sorting works with filters', async ({ page }) => {
	const user = await seedUser('winston');

	const account = await seedAccount({
		name: 'Test Account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 10000
	});

	const now = new UTCDate();

	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Credit A',
		value: 1000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Credit B',
		value: 500
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: now.toISOString(),
		description: 'Debit A',
		value: -200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Credit A' })).toBeVisible();

	// Apply Credits only filter first
	await page.getByLabel('Type').click();
	await page.getByRole('option', { name: 'Credits only' }).click();

	// Then sort by amount DESC - sorting should work on filtered results
	const amountHeader = page.getByRole('button', { name: 'Amount' });
	await amountHeader.click();
	await expect(page).toHaveURL(/sort=amount/);

	const rows = page.locator('tbody tr');

	// With filter applied, only credits visible, sorted by amount DESC (Credit A = 1000 > Credit B = 500)
	expect(await getRowIndex(rows, 'Credit A')).toBeLessThan(await getRowIndex(rows, 'Credit B'));
});

// --- securities list ---

test('securities list: defaults to security name ascending', async ({ page }) => {
	const user = await seedUser('bianca');
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner: user.id });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner: user.id });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner: user.id });

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/trades/securities');
	await expect(page.getByRole('row', { name: 'Apex Industries' })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	expect(await getRowIndex(rows, 'Apex Industries')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Zephyr Corp')
	);
});

test('securities list: clicking Security header toggles name descending then ascending', async ({
	page
}) => {
	const user = await seedUser('bianca');
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner: user.id });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner: user.id });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner: user.id });

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/trades/securities');
	await expect(page.getByRole('row', { name: 'Apex Industries' })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	const securityHeader = page.getByRole('button', { name: 'Security', exact: true });
	await securityHeader.click();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Zephyr Corp')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Apex Industries')
	);

	await securityHeader.click();

	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Apex Industries')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Zephyr Corp')
	);
});

test('securities list: clicking Symbol header sorts by symbol descending then ascending', async ({
	page
}) => {
	const user = await seedUser('bianca');
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner: user.id });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner: user.id });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner: user.id });

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/trades/securities');
	await expect(page.getByRole('row', { name: 'Apex Industries' })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	const symbolHeader = page.getByRole('button', { name: 'Symbol', exact: true });
	await symbolHeader.click();

	await expect(page).toHaveURL(/sort=symbol/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Apex Industries')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Zephyr Corp')
	);

	await symbolHeader.click();

	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Zephyr Corp')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Apex Industries')
	);
});

test('securities list: sort indicator shows on active column', async ({ page }) => {
	const user = await seedUser('bianca');
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner: user.id });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner: user.id });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner: user.id });

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/trades/securities');
	await expect(page.getByRole('row', { name: 'Apex Industries' })).toBeVisible();

	const symbolButton = page.getByRole('button', { name: 'Symbol', exact: true });
	const symbolHeader = symbolButton.locator('xpath=..');
	const securityHeader = page
		.getByRole('button', { name: 'Security', exact: true })
		.locator('xpath=..');
	await symbolButton.click();

	await expect(symbolHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(securityHeader).not.toHaveAttribute('aria-sort');
});

test('securities list: sort state persists across reload', async ({ page }) => {
	const user = await seedUser('bianca');
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner: user.id });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner: user.id });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner: user.id });

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/trades/securities');
	await expect(page.getByRole('row', { name: 'Apex Industries' })).toBeVisible();

	const symbolHeader = page.getByRole('button', { name: 'Symbol', exact: true });
	await symbolHeader.click();
	await symbolHeader.click();

	await expect(page).toHaveURL(/sort=symbol/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=symbol/);
	await expect(page).toHaveURL(/dir=asc/);
});

// --- security detail ---

test('security detail: defaults to market value descending', async ({ page }) => {
	const user = await seedUser('dominic');
	const security = await seedSecurity({ name: 'Detail Security', symbol: 'DTL', owner: user.id });
	const alpha = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const beta = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const gamma = await seedAccount({
		name: 'Gamma Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: alpha.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: beta.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: gamma.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/trades/securities/${security.id}`);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	await expect(rows.nth(1)).toContainText('Beta Brokerage');
	await expect(rows.nth(2)).toContainText('Gamma Brokerage');
	await expect(rows.nth(3)).toContainText('Alpha Brokerage');
});

test('security detail: clicking Account header sorts by account name descending then ascending', async ({
	page
}) => {
	const user = await seedUser('dominic');
	const security = await seedSecurity({ name: 'Detail Security', symbol: 'DTL', owner: user.id });
	const alpha = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const beta = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const gamma = await seedAccount({
		name: 'Gamma Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: alpha.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: beta.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: gamma.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/trades/securities/${security.id}`);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	const accountHeader = page
		.getByRole('table')
		.getByRole('button', { name: 'Account', exact: true });
	await accountHeader.click();

	await expect(page).toHaveURL(/sort=accountName/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Gamma Brokerage');
	await expect(rows.nth(2)).toContainText('Beta Brokerage');
	await expect(rows.nth(3)).toContainText('Alpha Brokerage');

	await accountHeader.click();

	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Brokerage');
	await expect(rows.nth(2)).toContainText('Beta Brokerage');
	await expect(rows.nth(3)).toContainText('Gamma Brokerage');
});

test('security detail: clicking Market value header sorts value ascending from default descending', async ({
	page
}) => {
	const user = await seedUser('dominic');
	const security = await seedSecurity({ name: 'Detail Security', symbol: 'DTL', owner: user.id });
	const alpha = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const beta = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const gamma = await seedAccount({
		name: 'Gamma Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: alpha.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: beta.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: gamma.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/trades/securities/${security.id}`);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	const valueHeader = page
		.getByRole('table')
		.getByRole('button', { name: 'Market value', exact: true });
	await valueHeader.click();

	await expect(page).toHaveURL(/sort=value/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Brokerage');
	await expect(rows.nth(2)).toContainText('Gamma Brokerage');
	await expect(rows.nth(3)).toContainText('Beta Brokerage');
});

test('security detail: clicking Gain/loss header sorts by gain amount descending', async ({
	page
}) => {
	const user = await seedUser('dominic');
	const security = await seedSecurity({ name: 'Detail Security', symbol: 'DTL', owner: user.id });
	const alpha = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const beta = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const gamma = await seedAccount({
		name: 'Gamma Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: alpha.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: beta.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: gamma.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/trades/securities/${security.id}`);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	const gainHeader = page
		.getByRole('table')
		.getByRole('button', { name: 'Gain/loss', exact: true });
	await gainHeader.click();

	await expect(page).toHaveURL(/sort=gainLoss/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Brokerage');
	await expect(rows.nth(2)).toContainText('Alpha Brokerage');
	await expect(rows.nth(3)).toContainText('Gamma Brokerage');
});

test('security detail: sort indicator shows on active column', async ({ page }) => {
	const user = await seedUser('dominic');
	const security = await seedSecurity({ name: 'Detail Security', symbol: 'DTL', owner: user.id });
	const alpha = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const beta = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const gamma = await seedAccount({
		name: 'Gamma Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: alpha.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: beta.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: gamma.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/trades/securities/${security.id}`);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const accountButton = page
		.getByRole('table')
		.getByRole('button', { name: 'Account', exact: true });
	const accountHeader = accountButton.locator('xpath=..');
	const valueHeader = page
		.getByRole('table')
		.getByRole('button', { name: 'Market value', exact: true })
		.locator('xpath=..');
	await accountButton.click();

	await expect(accountHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(valueHeader).not.toHaveAttribute('aria-sort');
});

test('security detail: sort state persists across reload', async ({ page }) => {
	const user = await seedUser('dominic');
	const security = await seedSecurity({ name: 'Detail Security', symbol: 'DTL', owner: user.id });
	const alpha = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const beta = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const gamma = await seedAccount({
		name: 'Gamma Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: alpha.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: beta.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 30,
		price: 100,
		value: 3000,
		costBasis: 2000
	});
	await seedSecurityBalance({
		account: gamma.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 20,
		price: 100,
		value: 2000,
		costBasis: 2500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto(`/trades/securities/${security.id}`);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const accountHeader = page
		.getByRole('table')
		.getByRole('button', { name: 'Account', exact: true });
	await accountHeader.click();
	await accountHeader.click();

	await expect(page).toHaveURL(/sort=accountName/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=accountName/);
	await expect(page).toHaveURL(/dir=asc/);
});

// --- portfolio ---

test('portfolio: aggregate table defaults to market value descending with unknown values last', async ({
	page
}) => {
	const user = await seedUser('fatima');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const secondAccount = await seedAccount({
		name: 'Second Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const thirdAccount = await seedAccount({
		name: 'Third Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ZZZ', owner: user.id });
	const bravo = await seedSecurity({ name: 'Bravo Holdings', symbol: 'WWW', owner: user.id });
	const charlie = await seedSecurity({ name: 'Charlie Holdings', symbol: 'YYY', owner: user.id });
	const delta = await seedSecurity({ name: 'Delta Holdings', symbol: 'XXX', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 10,
		price: 300,
		value: 3000,
		costBasis: 2500
	});
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: bravo.id,
		asOf,
		quantity: 14,
		price: 250,
		value: 3500,
		costBasis: 3000
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: charlie.id,
		asOf,
		quantity: 16,
		price: 250,
		value: 4000,
		costBasis: 3400
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 6,
		price: null,
		value: null,
		costBasis: 600
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 2,
		price: 50,
		value: 100,
		costBasis: 80
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	const rows = page.getByRole('table').getByRole('row');
	await expect(rows.nth(1)).toContainText('Alpha Holdings');
	await expect(rows.nth(2)).toContainText('Charlie Holdings');
	await expect(rows.nth(3)).toContainText('Bravo Holdings');
	await expect(rows.nth(4)).toContainText('Delta Holdings');
	await expect(rows.nth(4).locator('td').last()).toHaveText('~');
});

test('portfolio: aggregate table sorts by security name descending then ascending', async ({
	page
}) => {
	const user = await seedUser('fatima');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const secondAccount = await seedAccount({
		name: 'Second Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const thirdAccount = await seedAccount({
		name: 'Third Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ZZZ', owner: user.id });
	const bravo = await seedSecurity({ name: 'Bravo Holdings', symbol: 'WWW', owner: user.id });
	const charlie = await seedSecurity({ name: 'Charlie Holdings', symbol: 'YYY', owner: user.id });
	const delta = await seedSecurity({ name: 'Delta Holdings', symbol: 'XXX', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 10,
		price: 300,
		value: 3000,
		costBasis: 2500
	});
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: bravo.id,
		asOf,
		quantity: 14,
		price: 250,
		value: 3500,
		costBasis: 3000
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: charlie.id,
		asOf,
		quantity: 16,
		price: 250,
		value: 4000,
		costBasis: 3400
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 6,
		price: null,
		value: null,
		costBasis: 600
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 2,
		price: 50,
		value: 100,
		costBasis: 80
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	const rows = page.getByRole('table').getByRole('row');
	await expect(rows.nth(1)).toContainText('Alpha Holdings');

	const securityHeader = page.getByRole('button', { name: 'Security', exact: true });
	await securityHeader.click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Delta Holdings');
	await expect(rows.nth(2)).toContainText('Charlie Holdings');
	await expect(rows.nth(3)).toContainText('Bravo Holdings');
	await expect(rows.nth(4)).toContainText('Alpha Holdings');

	await securityHeader.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Holdings');
	await expect(rows.nth(2)).toContainText('Bravo Holdings');
	await expect(rows.nth(3)).toContainText('Charlie Holdings');
	await expect(rows.nth(4)).toContainText('Delta Holdings');
});

test('portfolio: aggregate table sorts by symbol', async ({ page }) => {
	const user = await seedUser('fatima');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const secondAccount = await seedAccount({
		name: 'Second Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const thirdAccount = await seedAccount({
		name: 'Third Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ZZZ', owner: user.id });
	const bravo = await seedSecurity({ name: 'Bravo Holdings', symbol: 'WWW', owner: user.id });
	const charlie = await seedSecurity({ name: 'Charlie Holdings', symbol: 'YYY', owner: user.id });
	const delta = await seedSecurity({ name: 'Delta Holdings', symbol: 'XXX', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 10,
		price: 300,
		value: 3000,
		costBasis: 2500
	});
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: bravo.id,
		asOf,
		quantity: 14,
		price: 250,
		value: 3500,
		costBasis: 3000
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: charlie.id,
		asOf,
		quantity: 16,
		price: 250,
		value: 4000,
		costBasis: 3400
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 6,
		price: null,
		value: null,
		costBasis: 600
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 2,
		price: 50,
		value: 100,
		costBasis: 80
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	const rows = page.getByRole('table').getByRole('row');
	await expect(rows.nth(1)).toContainText('Alpha Holdings');

	const symbolHeader = page.getByRole('button', { name: 'Symbol', exact: true });
	await symbolHeader.click();
	await expect(page).toHaveURL(/sort=symbol/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Alpha Holdings');
	await expect(rows.nth(2)).toContainText('Charlie Holdings');
	await expect(rows.nth(3)).toContainText('Delta Holdings');
	await expect(rows.nth(4)).toContainText('Bravo Holdings');
});

test('portfolio: aggregate table sorts by market value ascending with unknown values first', async ({
	page
}) => {
	const user = await seedUser('fatima');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const secondAccount = await seedAccount({
		name: 'Second Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const thirdAccount = await seedAccount({
		name: 'Third Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ZZZ', owner: user.id });
	const bravo = await seedSecurity({ name: 'Bravo Holdings', symbol: 'WWW', owner: user.id });
	const charlie = await seedSecurity({ name: 'Charlie Holdings', symbol: 'YYY', owner: user.id });
	const delta = await seedSecurity({ name: 'Delta Holdings', symbol: 'XXX', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 10,
		price: 300,
		value: 3000,
		costBasis: 2500
	});
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: bravo.id,
		asOf,
		quantity: 14,
		price: 250,
		value: 3500,
		costBasis: 3000
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: charlie.id,
		asOf,
		quantity: 16,
		price: 250,
		value: 4000,
		costBasis: 3400
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 6,
		price: null,
		value: null,
		costBasis: 600
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 2,
		price: 50,
		value: 100,
		costBasis: 80
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	const rows = page.getByRole('table').getByRole('row');
	await expect(rows.nth(1)).toContainText('Alpha Holdings');

	const valueHeader = page.getByRole('button', { name: 'Market value', exact: true });
	await valueHeader.click();
	await expect(page).toHaveURL(/sort=value/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Delta Holdings');
	await expect(rows.nth(2)).toContainText('Bravo Holdings');
	await expect(rows.nth(3)).toContainText('Charlie Holdings');
	await expect(rows.nth(4)).toContainText('Alpha Holdings');
});

test('portfolio: aggregate table marks the active sort column with aria-sort', async ({ page }) => {
	const user = await seedUser('fatima');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ZZZ', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Alpha Holdings');

	const securityButton = page.getByRole('button', { name: 'Security', exact: true });
	const securityHeader = securityButton.locator('xpath=..');
	const valueButton = page.getByRole('button', { name: 'Market value', exact: true });
	const valueHeader = valueButton.locator('xpath=..');
	await securityButton.click();

	await expect(securityHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(valueHeader).not.toHaveAttribute('aria-sort');
});

test('portfolio: aggregate table sort state persists across reload', async ({ page }) => {
	const user = await seedUser('fatima');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ZZZ', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Alpha Holdings');

	const securityHeader = page.getByRole('button', { name: 'Security', exact: true });
	await securityHeader.click();
	await securityHeader.click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=asc/);
});

test('portfolio: aggregate table does not make the Accounts column sortable', async ({ page }) => {
	const user = await seedUser('gunnar');
	const account = await seedAccount({
		name: 'Solo Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Solo Holdings', symbol: 'SOL', owner: user.id });
	const asOf = new Date().toISOString();
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Solo Holdings');

	await expect(page.getByRole('button', { name: 'Accounts', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Security', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Market value', exact: true })).toBeVisible();
});
