import { expect, test } from '@playwright/test';

import { getRowIndex, goToPageViaSidebar, goToRecordDetail, signIn } from './playwright.helpers';
import { seedPortfolio, seedSecurity, seedUser } from './pocketbase.helpers';

test('securities list: securities table sorts by column with order, aria-sort, and URL reflecting the active sort', async ({
	page
}) => {
	const user = await seedUser('bianca');
	// Symbols run counter to the names so a symbol sort can never be satisfied by a name sort.
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner: user.id });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner: user.id });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner: user.id });

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Securities');
	await expect(page.getByRole('row', { name: 'Apex Industries' })).toBeVisible();

	const rows = page.getByRole('table').getByRole('row');

	// Default sort is security name ascending.
	expect(await getRowIndex(rows, 'Apex Industries')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Zephyr Corp')
	);

	// Security toggles to descending first, then back to ascending.
	const securityButton = page.getByRole('button', { name: 'Security', exact: true });
	const securityHeader = securityButton.locator('xpath=..');
	await securityButton.click();
	await expect(page).toHaveURL(/sort=name/);
	await expect(page).toHaveURL(/dir=desc/);
	expect(await getRowIndex(rows, 'Zephyr Corp')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Apex Industries')
	);

	await securityButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Apex Industries')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Zephyr Corp')
	);

	// Symbol takes over the aria-sort marker and orders by ticker in both directions.
	const symbolButton = page.getByRole('button', { name: 'Symbol', exact: true });
	const symbolHeader = symbolButton.locator('xpath=..');
	await symbolButton.click();
	await expect(page).toHaveURL(/sort=symbol/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(symbolHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(securityHeader).not.toHaveAttribute('aria-sort');
	expect(await getRowIndex(rows, 'Apex Industries')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Zephyr Corp')
	);

	await symbolButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	expect(await getRowIndex(rows, 'Zephyr Corp')).toBeLessThan(
		await getRowIndex(rows, 'Midpoint Group')
	);
	expect(await getRowIndex(rows, 'Midpoint Group')).toBeLessThan(
		await getRowIndex(rows, 'Apex Industries')
	);

	// Sort state must survive a reload.
	await page.reload();

	await expect(page).toHaveURL(/sort=symbol/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(page.getByRole('row', { name: 'Zephyr Corp' })).toBeVisible();
	expect(await getRowIndex(rows, 'Zephyr Corp')).toBeLessThan(
		await getRowIndex(rows, 'Apex Industries')
	);
});

test('security detail: balances table sorts by column with order, aria-sort, and URL reflecting the active sort', async ({
	page
}) => {
	const user = await seedUser('dominic');
	// Gain/loss deliberately disagrees with market value: Gamma holds the second-largest
	// position but the only loss, so a gain sort cannot be satisfied by a value sort.
	const {
		securities: [security]
	} = await seedPortfolio(user.id, {
		accounts: ['Alpha Brokerage', 'Beta Brokerage', 'Gamma Brokerage'],
		securities: [{ name: 'Detail Security', symbol: 'DTL' }],
		balances: [
			{
				account: 'Alpha Brokerage',
				security: 'Detail Security',
				quantity: 10,
				price: 100,
				value: 1000,
				costBasis: 800
			},
			{
				account: 'Beta Brokerage',
				security: 'Detail Security',
				quantity: 30,
				price: 100,
				value: 3000,
				costBasis: 2000
			},
			{
				account: 'Gamma Brokerage',
				security: 'Detail Security',
				quantity: 20,
				price: 100,
				value: 2000,
				costBasis: 2500
			}
		]
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
	await expect(page.getByRole('row', { name: /Alpha Brokerage/ })).toBeVisible();

	const table = page.getByRole('table');
	const rows = table.getByRole('row');

	// Default sort is market value descending.
	await expect(rows.nth(1)).toContainText('Beta Brokerage');
	await expect(rows.nth(2)).toContainText('Gamma Brokerage');
	await expect(rows.nth(3)).toContainText('Alpha Brokerage');

	// Account sorts by name descending first, then ascending, and takes the aria-sort marker.
	const accountButton = table.getByRole('button', { name: 'Account', exact: true });
	const accountHeader = accountButton.locator('xpath=..');
	const valueButton = table.getByRole('button', { name: 'Market value', exact: true });
	const valueHeader = valueButton.locator('xpath=..');
	await accountButton.click();
	await expect(page).toHaveURL(/sort=accountName/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(accountHeader).toHaveAttribute('aria-sort', 'descending');
	await expect(valueHeader).not.toHaveAttribute('aria-sort');
	await expect(rows.nth(1)).toContainText('Gamma Brokerage');
	await expect(rows.nth(2)).toContainText('Beta Brokerage');
	await expect(rows.nth(3)).toContainText('Alpha Brokerage');

	await accountButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Brokerage');
	await expect(rows.nth(2)).toContainText('Beta Brokerage');
	await expect(rows.nth(3)).toContainText('Gamma Brokerage');

	// Switching columns starts market value in descending order.
	await valueButton.click();
	await expect(page).toHaveURL(/sort=value/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Brokerage');
	await expect(rows.nth(2)).toContainText('Gamma Brokerage');
	await expect(rows.nth(3)).toContainText('Alpha Brokerage');

	// A second click toggles market value to ascending.
	await valueButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Brokerage');
	await expect(rows.nth(2)).toContainText('Gamma Brokerage');
	await expect(rows.nth(3)).toContainText('Beta Brokerage');

	// Gain/loss starts with gain amount descending.
	await table.getByRole('button', { name: 'Gain/loss', exact: true }).click();
	await expect(page).toHaveURL(/sort=gainLoss/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Brokerage');
	await expect(rows.nth(2)).toContainText('Alpha Brokerage');
	await expect(rows.nth(3)).toContainText('Gamma Brokerage');

	// Sort state must survive a reload.
	await accountButton.click();
	await accountButton.click();
	await expect(page).toHaveURL(/sort=accountName/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=accountName/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Brokerage');
});

test('account positions: positions table sorts by column with order, aria-sort, and URL reflecting the active sort', async ({
	page
}) => {
	const user = await seedUser('helena');
	const {
		accounts: [account]
	} = await seedPortfolio(user.id, {
		accounts: ['Helena Brokerage'],
		securities: [
			{ name: 'Alpha Position', symbol: 'ALP' },
			{ name: 'Beta Position', symbol: 'BET' },
			{ name: 'Gamma Position', symbol: 'GAM' }
		],
		balances: [
			{
				account: 'Helena Brokerage',
				security: 'Alpha Position',
				quantity: 10,
				price: 100,
				value: 1000,
				costBasis: 800
			},
			{
				account: 'Helena Brokerage',
				security: 'Beta Position',
				quantity: 30,
				price: 100,
				value: 3000,
				costBasis: 2000
			},
			{
				account: 'Helena Brokerage',
				security: 'Gamma Position',
				quantity: 20,
				price: 100,
				value: 2000,
				costBasis: 2500
			}
		]
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', account.name);
	await expect(page.getByRole('row', { name: /Beta Position/ })).toBeVisible();

	const table = page.getByRole('table');
	const rows = table.getByRole('row');

	// Default sort is value descending.
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

	// Security sorts by name descending first, then ascending.
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

	// Switching columns starts market value in descending order.
	await marketValueButton.click();
	await expect(page).toHaveURL(/sort=value/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

	// A second click toggles market value to ascending.
	await marketValueButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Beta Position');

	// Gain/loss starts with gain amount descending.
	await table.getByRole('button', { name: 'Gain/loss', exact: true }).click();
	await expect(page).toHaveURL(/sort=gainLoss/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Alpha Position');
	await expect(rows.nth(3)).toContainText('Gamma Position');

	// Sort state must survive a reload.
	await securityButton.click();
	await securityButton.click();
	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
});
