import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedSecurity, seedSecurityBalance, seedUser } from './pocketbase.helpers';

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
