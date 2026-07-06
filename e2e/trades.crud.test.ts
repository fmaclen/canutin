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
	seedSecurityBalance,
	seedTrade,
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
	const trade = await seedTrade({
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
	await expect(page.getByLabel('Security')).toHaveText('Cobalt Growth Fund (CGF)');
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

test('creating, editing, and deleting trades never changes a position market value', async ({
	page
}) => {
	const user = await seedUser('uma');
	const account = await seedAccount({
		name: 'Granite Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Basalt Index Fund', symbol: 'BIF', owner: user.id });
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: new UTCDate().toISOString(),
		quantity: 20,
		price: 175,
		value: 3500,
		costBasis: 3000
	});

	await page.goto('/');
	await signIn(page, user.email);

	// The position market value is a manually-entered balance; trades defer to auto-calc and
	// must never mutate it. Capture it first, then assert it survives every trade mutation.
	await page.goto(`/securities/${security.id}`);
	const marketValue = page.getByRole('region', { name: 'Net market value' });
	await expect(marketValue).toContainText('$3,500.00');

	await goToPageViaSidebar(page, 'Trades');
	await page.getByRole('link', { name: 'Add trade' }).click();
	await expect(page).toHaveURL('/trades/add');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Granite Brokerage' }).click();
	await page.getByLabel('Date').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: 'Basalt Index Fund' }).click();
	await page.getByLabel('Description').fill('Basalt accumulation buy');
	await page.getByLabel('Quantity').fill('5');
	await page.getByLabel('Price').fill('180');
	await page.getByLabel('Amount').fill('900');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Trade added')).toBeVisible();
	await expect(page).toHaveURL('/trades');

	await page.goto(`/securities/${security.id}`);
	await expect(marketValue).toContainText('$3,500.00');

	await goToPageViaSidebar(page, 'Trades');
	await page.getByRole('link', { name: 'Basalt accumulation buy' }).click();
	await page.getByLabel('Quantity').fill('8');
	await page.getByLabel('Price').fill('190');
	await page.getByLabel('Amount').fill('1520');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Trade updated')).toBeVisible();
	await expect(page).toHaveURL('/trades');

	await page.goto(`/securities/${security.id}`);
	await expect(marketValue).toContainText('$3,500.00');

	await goToPageViaSidebar(page, 'Trades');
	await page.getByRole('link', { name: 'Basalt accumulation buy' }).click();
	await page.getByRole('button', { name: 'Delete' }).first().click();
	const deleteDialog = page.getByRole('alertdialog');
	await expect(deleteDialog).toBeVisible();
	await deleteDialog.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Trade deleted')).toBeVisible();
	await expect(page).toHaveURL('/trades');

	await page.goto(`/securities/${security.id}`);
	await expect(marketValue).toContainText('$3,500.00');
});

test('user can create a new security inline while adding a trade', async ({ page }) => {
	const user = await seedUser('viktor');
	const account = await seedAccount({
		name: 'Meridian Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new UTCDate().toISOString(),
		value: 5000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Trades');
	await page.getByRole('link', { name: 'Add trade' }).click();
	await expect(page).toHaveURL('/trades/add');

	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Meridian Brokerage' }).click();
	await page.getByLabel('Date').fill(formatDateForInput(new UTCDate()));

	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: 'Create new security' }).click();
	await expect(page.getByLabel('Name')).toBeVisible();
	await expect(page.getByLabel('Currency')).toBeVisible();
	await page.getByLabel('Name').fill('Thorium Yield Fund');
	await page.getByLabel('Symbol').fill('TYF');

	await page.getByLabel('Description').fill('Thorium opening position');
	await page.getByLabel('Quantity').fill('12');
	await page.getByLabel('Price').fill('150');
	await page.getByLabel('Amount').fill('1800');
	await page.getByLabel('Fees').fill('4');
	await page.getByRole('button', { name: 'Add' }).click();

	await expect(page.getByText('Trade added')).toBeVisible();
	await expect(page).toHaveURL('/trades');

	const tradeRow = page.getByRole('row', { name: /Thorium opening position/ });
	await expect(tradeRow).toBeVisible();
	await expect(tradeRow).toContainText('Thorium Yield Fund');
	await expect(tradeRow).toContainText('Meridian Brokerage');

	await goToPageViaSidebar(page, 'Securities');
	const securityRow = page.getByRole('row', { name: /Thorium Yield Fund/ });
	await expect(securityRow).toBeVisible();
	await expect(securityRow).toContainText('TYF');
});
