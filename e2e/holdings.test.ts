import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getUserPB,
	pbSend,
	resetDatabase,
	seedAccount,
	seedSecurity,
	seedSecurityBalance,
	seedUser
} from './pocketbase.helpers';

const CREATE_SECURITY_WITH_INITIAL_BALANCE_PATH = '/api/canutin/securities/with-initial-balance';

test.beforeEach(async () => {
	await resetDatabase();
});

test('security with initial balance can use any account', async () => {
	const user = await seedUser('charlie');
	const checking = await seedAccount({
		name: 'Checking account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Checking',
		owner: user.id
	});

	const response = await pbSend(
		CREATE_SECURITY_WITH_INITIAL_BALANCE_PATH,
		{
			security: {
				name: 'Rollback Fund',
				symbol: 'RBF',
				owner: user.id
			},
			balance: {
				account: checking.id,
				owner: user.id,
				asOf: '2026-03-01T00:00:00.000Z',
				quantity: 4,
				price: 25,
				value: 100,
				costBasis: 80
			}
		},
		user.email
	);
	expect(response.status).toBe(200);

	const pb = await getUserPB(user.email);
	const securities = await pb.collection('securities').getFullList({
		filter: `owner='${user.id}'`
	});
	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner='${user.id}'`
	});
	expect(securities).toHaveLength(1);
	expect(balances).toHaveLength(1);
});

test('holdings aggregate latest security balances and edit security details', async ({ page }) => {
	const user = await seedUser('alice');

	const taxable = await seedAccount({
		name: 'Taxable brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage',
		owner: user.id
	});
	const roth = await seedAccount({
		name: 'Roth IRA',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Retirement',
		owner: user.id
	});
	await seedAccount({
		name: 'Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Checking',
		owner: user.id
	});
	const closed = await seedAccount({
		name: 'Closed brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage',
		owner: user.id,
		closed: new Date().toISOString()
	});

	const totalMarket = await seedSecurity({
		name: 'Total Market Fund',
		symbol: 'VTI',
		owner: user.id
	});
	const missingCost = await seedSecurity({
		name: 'Single Stock',
		symbol: 'ONE',
		owner: user.id
	});
	const zeroQuantity = await seedSecurity({
		name: 'Zero Fund',
		symbol: 'ZERO',
		owner: user.id
	});

	await seedSecurityBalance({
		account: taxable.id,
		security: totalMarket.id,
		owner: user.id,
		asOf: '2026-01-01T00:00:00.000Z',
		quantity: 30,
		price: 10,
		value: 300,
		costBasis: 240
	});
	await seedSecurityBalance({
		account: taxable.id,
		security: totalMarket.id,
		owner: user.id,
		asOf: '2026-02-01T00:00:00.000Z',
		quantity: 5,
		price: 12,
		value: 60,
		costBasis: 50
	});
	await seedSecurityBalance({
		account: roth.id,
		security: totalMarket.id,
		owner: user.id,
		asOf: '2026-02-01T00:00:00.000Z',
		quantity: 2,
		price: 12,
		value: 24,
		costBasis: 20
	});
	await seedSecurityBalance({
		account: closed.id,
		security: totalMarket.id,
		owner: user.id,
		asOf: '2026-02-01T00:00:00.000Z',
		quantity: 88,
		price: 12,
		value: 1056,
		costBasis: 880
	});
	await seedSecurityBalance({
		account: taxable.id,
		security: missingCost.id,
		owner: user.id,
		asOf: '2026-02-01T00:00:00.000Z',
		quantity: 1,
		price: 100,
		value: 100
	});
	await seedSecurityBalance({
		account: taxable.id,
		security: zeroQuantity.id,
		owner: user.id,
		asOf: '2026-02-01T00:00:00.000Z',
		quantity: 0,
		price: 20,
		value: 0,
		costBasis: 0
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Holdings');

	const fundRow = page.getByRole('row', { name: 'Total Market Fund' });
	await expect(fundRow).toBeVisible();
	await expect(fundRow).toContainText('VTI');
	await expect(fundRow).toContainText('Roth IRA, Taxable brokerage');
	await expect(fundRow).toContainText('7');
	await expect(fundRow).toContainText('$84.00');
	await expect(fundRow).toContainText('$70.00');
	await expect(fundRow).toContainText('$14.00');
	await expect(fundRow).not.toContainText('$300.00');
	await expect(fundRow).not.toContainText('Checking');
	await expect(fundRow).not.toContainText('Closed brokerage');

	const singleStockRow = page.getByRole('row', { name: 'Single Stock' });
	await expect(singleStockRow).toBeVisible();
	await expect(singleStockRow).toContainText('$100.00');
	await expect(singleStockRow.locator('td').nth(5)).toContainText('~');
	await expect(singleStockRow.locator('td').nth(6)).toContainText('~');
	await expect(page.getByRole('row', { name: 'Zero Fund' })).not.toBeVisible();

	await fundRow.getByRole('link', { name: 'Total Market Fund' }).click();
	await expect(page).toHaveURL(/\/holdings\/[^/]+$/);
	await expect(page.getByText('Balances')).toBeVisible();
	const taxableRow = page.getByRole('row', { name: 'Taxable brokerage' });
	await expect(taxableRow).toContainText('5');
	await expect(taxableRow).toContainText('$12.00');
	await expect(taxableRow).toContainText('$60.00');
	await expect(taxableRow).toContainText('$50.00');
	await expect(taxableRow).toContainText('$10.00');
	const rothRow = page.getByRole('row', { name: 'Roth IRA' });
	await expect(rothRow).toContainText('2');
	await expect(rothRow).toContainText('$24.00');
	await expect(rothRow).toContainText('$20.00');
	await expect(rothRow).toContainText('$4.00');
	await expect(page.getByRole('row', { name: 'Holdings total' })).toContainText('$14.00');

	await page.getByLabel('Name').fill('Renamed Total Market');
	await page.getByLabel('Symbol').fill('VTIX');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Holding updated')).toBeVisible();

	await goToPageViaSidebar(page, 'Holdings');
	const renamedRow = page.getByRole('row', { name: 'Renamed Total Market' });
	await expect(renamedRow).toBeVisible();
	await expect(renamedRow).toContainText('VTIX');

	await expect(page.getByRole('row', { name: 'Emerging Market Fund' })).not.toBeVisible();

	await page.getByRole('link', { name: 'Add holding' }).click();
	await expect(page).toHaveURL('/holdings/add');
	await expect(page.getByLabel('As of')).toHaveValue(/\d{4}-\d{2}-\d{2}/);
	await page.getByLabel('Account').click();
	await expect(page.getByRole('option', { name: 'Taxable brokerage' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Roth IRA' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Checking' })).not.toBeVisible();
	await expect(page.getByRole('option', { name: 'Closed brokerage' })).not.toBeVisible();
	await page.getByRole('option', { name: 'Roth IRA' }).click();
	await page.getByLabel('Name').fill('Emerging Market Fund');
	await page.getByLabel('Symbol').fill('EMF');
	await page.getByLabel('As of').fill('2026-03-01');
	await page.getByLabel('Quantity').fill('4');
	await page.getByLabel('Price').fill('25');
	await page.getByLabel('Cost basis').fill('80');
	await page.getByRole('button', { name: 'Add holding' }).click();
	await expect(page.getByText('Holding added')).toBeVisible();

	await expect(page).toHaveURL(/\/holdings\/[^/]+$/);
	await expect(page.getByText('Balances')).toBeVisible();
	const createdRothRow = page.getByRole('row', { name: 'Roth IRA' });
	await expect(createdRothRow).toContainText('4');
	await expect(createdRothRow).toContainText('$25.00');
	await expect(createdRothRow.locator('td').nth(3)).toContainText('~');
	await expect(createdRothRow).toContainText('$80.00');
	await expect(createdRothRow.locator('td').nth(5)).toContainText('~');

	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Taxable brokerage' }).click();
	await page.getByLabel('As of').fill('2026-04-01');
	await page.getByLabel('Quantity').fill('0');
	await page.getByLabel('Price').fill('0');
	await page.getByLabel('Value').fill('0');
	await page.getByRole('button', { name: 'Add balance' }).click();
	await expect(page.getByText('Balance updated')).toBeVisible();

	const createdTaxableRow = page.getByRole('row', { name: 'Taxable brokerage' });
	await expect(createdTaxableRow).toContainText('0');
	await expect(createdTaxableRow).toContainText('$0.00');
	await expect(createdTaxableRow.locator('td').nth(4)).toContainText('~');

	await goToPageViaSidebar(page, 'Holdings');
	const createdHoldingRow = page.getByRole('row', { name: 'Emerging Market Fund' });
	await expect(createdHoldingRow).toBeVisible();
	await expect(createdHoldingRow).toContainText('EMF');
	await expect(createdHoldingRow).toContainText('Roth IRA');
	await expect(createdHoldingRow).not.toContainText('Taxable brokerage');
	await expect(createdHoldingRow.locator('td').nth(4)).toContainText('~');
	await expect(createdHoldingRow.locator('td').nth(5)).toContainText('$80.00');
	await expect(createdHoldingRow.locator('td').nth(6)).toContainText('~');
});
