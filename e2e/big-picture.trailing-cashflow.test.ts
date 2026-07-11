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

	// Transactions span the 3M, 6M, and 1Y windows across both account kinds.
	// M-1 contributes $1,200 income and $600 expenses to every window.
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

	// M-5 contributes $300 income and $150 expenses only to 6M and 1Y.
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

	// M-11 contributes $600 income and $300 expenses only to 1Y.
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

	// 6M totals average to $250 income, $125 expenses, and $125 surplus.
	await expect(income).toContainText('$250');
	await expect(expenses).toContainText('$125');
	await expect(surplus).toContainText('$125');

	// 3M includes only M-1, averaging $400 income and $200 expenses.
	await page.getByRole('tab', { name: '3M' }).click();
	await expect(income).toContainText('$400');
	await expect(expenses).toContainText('$200');
	await expect(surplus).toContainText('$200');

	// 1Y includes every seed window, averaging $175 income and $88 expenses.
	await page.getByRole('tab', { name: '1Y' }).click();
	await expect(income).toContainText('$175');
	await expect(expenses).toContainText('$88');
	await expect(surplus).toContainText('$88');
});
