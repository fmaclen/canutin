import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';
import { setHours, subDays } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import { formatDateForInput, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedSecurity,
	seedSecurityTransaction,
	seedUser
} from './pocketbase.helpers';

test('user can edit and delete a trade from the trades list', async ({ page }) => {
	const user = await seedUser('tobias');

	const brokerageAccount = await seedAccount({
		name: 'Summit Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: brokerageAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});
	const retirementAccount = await seedAccount({
		name: 'Horizon Retirement',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Retirement'
	});
	await seedAccountBalance({
		account: retirementAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 500
	});

	const security = await seedSecurity({
		name: 'Cobalt Growth Fund',
		symbol: 'CGF',
		owner: user.id
	});

	const tradeDate = setHours(subDays(new UTCDate(), 4), 12);
	const trade = await seedSecurityTransaction({
		account: brokerageAccount.id,
		owner: user.id,
		security: security.id,
		date: tradeDate.toISOString(),
		type: SecurityTransactionsTypeOptions.buy,
		description: 'Cobalt opening position',
		quantity: 10,
		price: 200,
		amount: 2000,
		fees: 5
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Trades');

	const openingRow = page.getByRole('row', { name: /Cobalt opening position/ });
	await expect(openingRow).toBeVisible();
	await expect(openingRow).toContainText('Cobalt Growth Fund');
	await expect(openingRow).toContainText('Summit Brokerage');

	await page.getByRole('link', { name: 'Cobalt opening position' }).click();
	await expect(page).toHaveURL(new RegExp(`/trades/${trade.id}(\\?|$)`));
	await expect(page.getByLabel('Account')).toHaveText('Summit Brokerage');
	await expect(page.getByLabel('Date')).toHaveValue(formatDateForInput(tradeDate));
	await expect(page.getByLabel('Security')).toHaveText('Cobalt Growth Fund');
	await expect(page.getByLabel('Description')).toHaveValue('Cobalt opening position');
	await expect(page.getByLabel('Quantity')).toHaveValue('10.00');
	await expect(page.getByLabel('Price')).toHaveValue('$200.00');
	await expect(page.getByLabel('Amount')).toHaveValue('$2,000.00');
	await expect(page.getByLabel('Fees')).toHaveValue('$5.00');

	await page.getByLabel('Description').fill('Cobalt add-on purchase');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Horizon Retirement' }).click();
	await page.getByLabel('Quantity').fill('15');
	await page.getByLabel('Price').fill('210');
	await page.getByLabel('Amount').fill('3150');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Trade updated')).toBeVisible();
	await expect(page).toHaveURL('/trades');
	await expect(page.getByText('Cobalt opening position')).not.toBeVisible();

	const updatedRow = page.getByRole('row', { name: /Cobalt add-on purchase/ });
	await expect(updatedRow).toBeVisible();
	await expect(updatedRow).toContainText('Cobalt Growth Fund');
	await expect(updatedRow).toContainText('Horizon Retirement');
	await expect(updatedRow).toContainText('$3,150.00');

	await page.getByRole('link', { name: 'Cobalt add-on purchase' }).click();
	await expect(page).toHaveURL(new RegExp(`/trades/${trade.id}(\\?|$)`));
	await expect(page.getByLabel('Quantity')).toHaveValue('15.00');
	await expect(page.getByLabel('Price')).toHaveValue('$210.00');
	await expect(page.getByLabel('Amount')).toHaveValue('$3,150.00');

	await page.getByRole('button', { name: 'Delete' }).first().click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Are you absolutely sure?')).toBeVisible();

	await dialog.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Trade deleted')).toBeVisible();
	await expect(page).toHaveURL('/trades');
	await expect(page.getByText('Cobalt add-on purchase')).not.toBeVisible();
});
