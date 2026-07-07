import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedCurrency,
	seedExchangeRate,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

const ARS_PER_USD = 1495;
const EUR_PER_USD = 0.92;

function utcIso(date: string) {
	return `${date}T00:00:00.000Z`;
}

test('foreign-currency records render in the display currency with FX indicators and follow the currency preference', async ({
	page
}) => {
	const user = await seedUser('mateo');
	const balanceDate = utcIso('2026-06-25');
	const salaryDate = utcIso('2026-06-15');
	const rentDate = utcIso('2026-06-05');

	await seedCurrency({ owner: user.id, code: 'ARS', name: 'Argentine peso', autoUpdate: false });
	await seedCurrency({ owner: user.id, code: 'EUR', name: 'Euro', autoUpdate: false });
	for (const when of [balanceDate, salaryDate, rentDate]) {
		await seedExchangeRate({
			owner: user.id,
			currency: 'ARS',
			date: when,
			rate: ARS_PER_USD
		});
		await seedExchangeRate({
			owner: user.id,
			currency: 'EUR',
			date: when,
			rate: EUR_PER_USD
		});
	}

	const account = await seedAccount({
		name: 'Cuenta Corriente',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		currency: 'ARS'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: balanceDate,
		value: 4_500_000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: salaryDate,
		description: 'Sueldo',
		value: 1_000_000
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: rentDate,
		description: 'Alquiler',
		value: -500_000
	});

	// Session entry point before sign-in.
	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	const salaryRow = page.getByRole('row', { name: 'Sueldo' });
	await expect(salaryRow.getByText('$668.90')).toBeVisible();
	await expect(salaryRow.getByLabel('Converted from $ 1.000.000,00 ARS')).toBeVisible();

	const rentRow = page.getByRole('row', { name: 'Alquiler' });
	await expect(rentRow.getByText('-$334.45')).toBeVisible();
	await expect(rentRow.getByLabel('Converted from -$ 500.000,00 ARS')).toBeVisible();

	const summary = page.getByRole('region', { name: 'Transactions summary' });
	const netAmount = summary.getByRole('region', { name: 'Net amount' });
	await expect(netAmount.getByText('$334.45')).toBeVisible();
	await expect(netAmount.getByLabel('Includes converted amounts')).toHaveCount(0);

	await salaryRow.getByRole('link', { name: 'Sueldo' }).click();
	await expect(page).toHaveURL(/\/transactions\//);
	await expect(page.getByLabel('Amount')).toHaveValue(/\$\s1\.000\.000,00/);

	await goToPageViaSidebar(page, 'Accounts');

	const accountRow = page.getByRole('row', { name: 'Cuenta Corriente' });
	await expect(accountRow.getByText('$3,010.03')).toBeVisible();
	await expect(accountRow.getByLabel('Converted from $ 4.500.000,00 ARS')).toBeVisible();

	const netBalance = page.getByRole('region', { name: 'Net balance' });
	await expect(netBalance).toContainText('$3,010.03');
	await expect(netBalance.getByLabel('Includes converted amounts')).toHaveCount(0);

	await goToPageViaSidebar(page, 'Big picture');

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('$3,010');
	await expect(page.getByLabel('Includes converted amounts')).toHaveCount(0);

	const cash = page.getByRole('region', { name: 'Cash' });
	await expect(cash).toContainText('$3,010');

	await goToPageViaSidebar(page, 'Settings');
	await page.getByLabel('Default currency').click();
	await page.getByRole('option', { name: /EUR\s+Euro/ }).click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Settings updated')).toBeVisible();

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Sueldo' }).getByText('€615.38')).toBeVisible();
	await expect(page.getByRole('row', { name: 'Alquiler' }).getByText('-€307.69')).toBeVisible();

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('region', { name: 'Net balance' })).toContainText('€2,769.23');
});

test('a US-dollar account renders without any exchange-rate indicators', async ({ page }) => {
	const user = await seedUser('omar');

	const account = await seedAccount({
		name: 'Everyday Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		currency: 'USD'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2500
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Paycheck',
		value: 1500
	});

	// Session entry point before sign-in.
	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');

	await expect(page.getByRole('row', { name: 'Paycheck' }).getByText('$1,500.00')).toBeVisible();
	await expect(page.getByLabel(/Converted from/)).toHaveCount(0);
	await expect(page.getByLabel('Includes converted amounts')).toHaveCount(0);
	await expect(page.getByLabel(/No exchange rate/)).toHaveCount(0);
	await expect(page.getByLabel('Includes amounts that could not be converted')).toHaveCount(0);

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('region', { name: 'Net balance' })).toContainText('$2,500.00');
	await expect(page.getByLabel(/Converted from/)).toHaveCount(0);
	await expect(page.getByLabel('Includes converted amounts')).toHaveCount(0);
});

test('unconvertible balances render native amounts and are excluded from totals', async ({
	page
}) => {
	const user = await seedUser('noelia');
	const noRateTooltip =
		'No exchange rate for ARS — add a quote or enable automatic updates in Currencies';

	await seedCurrency({ owner: user.id, code: 'ARS', name: 'Argentine peso', autoUpdate: false });
	const arsAccount = await seedAccount({
		name: 'Unquoted pesos',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		currency: 'ARS'
	});
	const usdAccount = await seedAccount({
		name: 'Dollar checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		currency: 'USD'
	});
	await seedAccountBalance({
		account: arsAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1_495_000
	});
	await seedAccountBalance({
		account: usdAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 200
	});

	// Session entry point before sign-in.
	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');

	const row = page.getByRole('row', { name: 'Unquoted pesos' });
	const noRateAmount = row.getByLabel(noRateTooltip);
	await expect(noRateAmount).toBeVisible();
	await expect(noRateAmount).toHaveClass(/border-dashed/);
	await expect(noRateAmount.locator('span')).toHaveClass(/text-muted-foreground/);
	await expect(row.getByText(/\$\s1\.495\.000,00/)).toBeVisible();

	const netBalance = page.getByRole('region', { name: 'Net balance' });
	await expect(netBalance).toContainText('$200.00');
	await expect(netBalance.getByLabel('Includes amounts that could not be converted')).toBeVisible();
	await expect(netBalance).not.toContainText('$1,495,200.00');
});
