import { expect, test } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedPortfolio, seedUser } from './pocketbase.helpers';

test('portfolio: aggregate table defaults to market value descending with unknown values last', async ({
	page
}) => {
	const user = await seedUser('fatima');
	await seedPortfolio(user.id, {
		accounts: ['Main Brokerage', 'Second Brokerage', 'Third Brokerage'],
		securities: [
			{ name: 'Alpha Holdings', symbol: 'ZZZ' },
			{ name: 'Bravo Holdings', symbol: 'WWW' },
			{ name: 'Charlie Holdings', symbol: 'YYY' },
			{ name: 'Delta Holdings', symbol: 'XXX' }
		],
		balances: [
			{
				account: 'Main Brokerage',
				security: 'Alpha Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			},
			{
				account: 'Third Brokerage',
				security: 'Alpha Holdings',
				quantity: 10,
				price: 300,
				value: 3000,
				costBasis: 2500
			},
			{
				account: 'Main Brokerage',
				security: 'Bravo Holdings',
				quantity: 14,
				price: 250,
				value: 3500,
				costBasis: 3000
			},
			{
				account: 'Second Brokerage',
				security: 'Charlie Holdings',
				quantity: 16,
				price: 250,
				value: 4000,
				costBasis: 3400
			},
			{
				account: 'Second Brokerage',
				security: 'Delta Holdings',
				quantity: 6,
				price: null,
				value: null,
				costBasis: 600
			},
			{
				account: 'Third Brokerage',
				security: 'Delta Holdings',
				quantity: 2,
				price: 50,
				value: 100,
				costBasis: 80
			}
		]
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
	await seedPortfolio(user.id, {
		accounts: ['Main Brokerage', 'Second Brokerage', 'Third Brokerage'],
		securities: [
			{ name: 'Alpha Holdings', symbol: 'ZZZ' },
			{ name: 'Bravo Holdings', symbol: 'WWW' },
			{ name: 'Charlie Holdings', symbol: 'YYY' },
			{ name: 'Delta Holdings', symbol: 'XXX' }
		],
		balances: [
			{
				account: 'Main Brokerage',
				security: 'Alpha Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			},
			{
				account: 'Third Brokerage',
				security: 'Alpha Holdings',
				quantity: 10,
				price: 300,
				value: 3000,
				costBasis: 2500
			},
			{
				account: 'Main Brokerage',
				security: 'Bravo Holdings',
				quantity: 14,
				price: 250,
				value: 3500,
				costBasis: 3000
			},
			{
				account: 'Second Brokerage',
				security: 'Charlie Holdings',
				quantity: 16,
				price: 250,
				value: 4000,
				costBasis: 3400
			},
			{
				account: 'Second Brokerage',
				security: 'Delta Holdings',
				quantity: 6,
				price: null,
				value: null,
				costBasis: 600
			},
			{
				account: 'Third Brokerage',
				security: 'Delta Holdings',
				quantity: 2,
				price: 50,
				value: 100,
				costBasis: 80
			}
		]
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
	await seedPortfolio(user.id, {
		accounts: ['Main Brokerage', 'Second Brokerage', 'Third Brokerage'],
		securities: [
			{ name: 'Alpha Holdings', symbol: 'ZZZ' },
			{ name: 'Bravo Holdings', symbol: 'WWW' },
			{ name: 'Charlie Holdings', symbol: 'YYY' },
			{ name: 'Delta Holdings', symbol: 'XXX' }
		],
		balances: [
			{
				account: 'Main Brokerage',
				security: 'Alpha Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			},
			{
				account: 'Third Brokerage',
				security: 'Alpha Holdings',
				quantity: 10,
				price: 300,
				value: 3000,
				costBasis: 2500
			},
			{
				account: 'Main Brokerage',
				security: 'Bravo Holdings',
				quantity: 14,
				price: 250,
				value: 3500,
				costBasis: 3000
			},
			{
				account: 'Second Brokerage',
				security: 'Charlie Holdings',
				quantity: 16,
				price: 250,
				value: 4000,
				costBasis: 3400
			},
			{
				account: 'Second Brokerage',
				security: 'Delta Holdings',
				quantity: 6,
				price: null,
				value: null,
				costBasis: 600
			},
			{
				account: 'Third Brokerage',
				security: 'Delta Holdings',
				quantity: 2,
				price: 50,
				value: 100,
				costBasis: 80
			}
		]
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
	await seedPortfolio(user.id, {
		accounts: ['Main Brokerage', 'Second Brokerage', 'Third Brokerage'],
		securities: [
			{ name: 'Alpha Holdings', symbol: 'ZZZ' },
			{ name: 'Bravo Holdings', symbol: 'WWW' },
			{ name: 'Charlie Holdings', symbol: 'YYY' },
			{ name: 'Delta Holdings', symbol: 'XXX' }
		],
		balances: [
			{
				account: 'Main Brokerage',
				security: 'Alpha Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			},
			{
				account: 'Third Brokerage',
				security: 'Alpha Holdings',
				quantity: 10,
				price: 300,
				value: 3000,
				costBasis: 2500
			},
			{
				account: 'Main Brokerage',
				security: 'Bravo Holdings',
				quantity: 14,
				price: 250,
				value: 3500,
				costBasis: 3000
			},
			{
				account: 'Second Brokerage',
				security: 'Charlie Holdings',
				quantity: 16,
				price: 250,
				value: 4000,
				costBasis: 3400
			},
			{
				account: 'Second Brokerage',
				security: 'Delta Holdings',
				quantity: 6,
				price: null,
				value: null,
				costBasis: 600
			},
			{
				account: 'Third Brokerage',
				security: 'Delta Holdings',
				quantity: 2,
				price: 50,
				value: 100,
				costBasis: 80
			}
		]
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
	await seedPortfolio(user.id, {
		accounts: ['Main Brokerage'],
		securities: [{ name: 'Alpha Holdings', symbol: 'ZZZ' }],
		balances: [
			{
				account: 'Main Brokerage',
				security: 'Alpha Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			}
		]
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
	await seedPortfolio(user.id, {
		accounts: ['Main Brokerage'],
		securities: [{ name: 'Alpha Holdings', symbol: 'ZZZ' }],
		balances: [
			{
				account: 'Main Brokerage',
				security: 'Alpha Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			}
		]
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
	await seedPortfolio(user.id, {
		accounts: ['Solo Brokerage'],
		securities: [{ name: 'Solo Holdings', symbol: 'SOL' }],
		balances: [
			{
				account: 'Solo Brokerage',
				security: 'Solo Holdings',
				quantity: 5,
				price: 300,
				value: 1500,
				costBasis: 1200
			}
		]
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/portfolio');
	await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Solo Holdings');

	await expect(page.getByRole('button', { name: 'Accounts', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Security', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Market value', exact: true })).toBeVisible();
});
