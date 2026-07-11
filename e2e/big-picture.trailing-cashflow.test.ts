import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { isoMidOfMonthMonthsAgo, signIn } from './playwright.helpers';
import { seedAccount, seedTransaction, seedUser } from './pocketbase.helpers';

test('big picture trailing cashflow', async ({ page }) => {
	const user = await seedUser('daphne');

	await page.goto('/');
	await signIn(page, user.email);

	const income = page.getByRole('region', { name: 'Income per month' });
	const expenses = page.getByRole('region', { name: 'Expenses per month' });
	const surplus = page.getByRole('region', { name: 'Surplus per month' });

	await expect(income).toContainText('$0');
	await expect(expenses).toContainText('$0');
	await expect(surplus).toContainText('$0');

	const creditCardAccount = await seedAccount({
		name: 'Crescent Classic',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card'
	});
	const autoCalculatedAccount = await seedAccount({
		name: 'Everyday',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});

	const when1M = isoMidOfMonthMonthsAgo(1);
	const when5M = isoMidOfMonthMonthsAgo(5);
	const when11M = isoMidOfMonthMonthsAgo(11);

	await seedTransaction({
		account: creditCardAccount.id,
		owner: user.id,
		date: when1M,
		description: 'Paycheck M-1',
		value: 1200
	});
	await seedTransaction({
		account: creditCardAccount.id,
		owner: user.id,
		date: when1M,
		description: 'Groceries M-1',
		value: -600
	});

	await seedTransaction({
		account: autoCalculatedAccount.id,
		owner: user.id,
		date: when5M,
		description: 'Paycheck M-5',
		value: 300
	});
	await seedTransaction({
		account: creditCardAccount.id,
		owner: user.id,
		date: when5M,
		description: 'Groceries M-5',
		value: -150
	});

	await seedTransaction({
		account: autoCalculatedAccount.id,
		owner: user.id,
		date: when11M,
		description: 'Paycheck M-11',
		value: 600
	});
	await seedTransaction({
		account: creditCardAccount.id,
		owner: user.id,
		date: when11M,
		description: 'Groceries M-11',
		value: -300
	});

	await expect(income).toContainText('$250');
	await expect(expenses).toContainText('$125');
	await expect(surplus).toContainText('$125');

	await page.getByRole('tab', { name: '3M' }).click();
	await expect(income).toContainText('$400');
	await expect(expenses).toContainText('$200');
	await expect(surplus).toContainText('$200');

	await page.getByRole('tab', { name: '1Y' }).click();
	await expect(income).toContainText('$175');
	await expect(expenses).toContainText('$88');
	await expect(surplus).toContainText('$88');
});
