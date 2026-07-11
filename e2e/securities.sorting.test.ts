import { expect, test } from '@playwright/test';

import { getRowIndex, goToPageViaSidebar, goToRecordDetail, signIn } from './playwright.helpers';
import { seedPortfolio, seedSecurity, seedUser } from './pocketbase.helpers';

async function seedSortingSecurities(owner: string) {
	await seedSecurity({ name: 'Apex Industries', symbol: 'ZZZ', owner });
	await seedSecurity({ name: 'Midpoint Group', symbol: 'MMM', owner });
	await seedSecurity({ name: 'Zephyr Corp', symbol: 'AAA', owner });
}

function seedSecurityDetailPortfolio(userId: string) {
	return seedPortfolio(userId, {
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
}

test('securities list: defaults to security name ascending', async ({ page }) => {
	const user = await seedUser('bianca');
	await seedSortingSecurities(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Securities');
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
	await seedSortingSecurities(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Securities');
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
	await seedSortingSecurities(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Securities');
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
	await seedSortingSecurities(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Securities');
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
	await seedSortingSecurities(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Securities');
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

test('security detail: defaults to market value descending', async ({ page }) => {
	const user = await seedUser('dominic');
	const {
		securities: [security]
	} = await seedSecurityDetailPortfolio(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
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
	const {
		securities: [security]
	} = await seedSecurityDetailPortfolio(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
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
	const {
		securities: [security]
	} = await seedSecurityDetailPortfolio(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
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
	const {
		securities: [security]
	} = await seedSecurityDetailPortfolio(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
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
	const {
		securities: [security]
	} = await seedSecurityDetailPortfolio(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
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
	const {
		securities: [security]
	} = await seedSecurityDetailPortfolio(user.id);

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
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

	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

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

	await marketValueButton.click();
	await expect(page).toHaveURL(/sort=value/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Alpha Position');

	await marketValueButton.click();
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
	await expect(rows.nth(2)).toContainText('Gamma Position');
	await expect(rows.nth(3)).toContainText('Beta Position');

	await table.getByRole('button', { name: 'Gain/loss', exact: true }).click();
	await expect(page).toHaveURL(/sort=gainLoss/);
	await expect(page).toHaveURL(/dir=desc/);
	await expect(rows.nth(1)).toContainText('Beta Position');
	await expect(rows.nth(2)).toContainText('Alpha Position');
	await expect(rows.nth(3)).toContainText('Gamma Position');

	await securityButton.click();
	await securityButton.click();
	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=asc/);

	await page.reload();

	await expect(page).toHaveURL(/sort=securityName/);
	await expect(page).toHaveURL(/dir=asc/);
	await expect(rows.nth(1)).toContainText('Alpha Position');
});
