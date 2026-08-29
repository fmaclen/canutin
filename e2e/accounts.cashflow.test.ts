import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToRecordDetail, isoMidOfMonthMonthsAgo, signIn } from './playwright.helpers';
import { seedAccount, seedTransaction, seedUser } from './pocketbase.helpers';

test('account trailing cashflow is filtered to a single account', async ({ page }) => {
	const user = await seedUser('matilda');

	const focusedAccount = await seedAccount({
		name: 'Everyday Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	const otherAccount = await seedAccount({
		name: 'Side Hustle',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});

	const when1M = isoMidOfMonthMonthsAgo(1);
	const when5M = isoMidOfMonthMonthsAgo(5);
	const when11M = isoMidOfMonthMonthsAgo(11);

	// Focused-account amounts exercise distinct 3M, 6M, and 1Y averages.
	await seedTransaction({
		account: focusedAccount.id,
		owner: user.id,
		date: when1M,
		description: 'Paycheck M-1',
		value: 1200
	});
	await seedTransaction({
		account: focusedAccount.id,
		owner: user.id,
		date: when1M,
		description: 'Groceries M-1',
		value: -600
	});
	await seedTransaction({
		account: focusedAccount.id,
		owner: user.id,
		date: when5M,
		description: 'Paycheck M-5',
		value: 300
	});
	await seedTransaction({
		account: focusedAccount.id,
		owner: user.id,
		date: when5M,
		description: 'Groceries M-5',
		value: -150
	});
	await seedTransaction({
		account: focusedAccount.id,
		owner: user.id,
		date: when11M,
		description: 'Paycheck M-11',
		value: 600
	});
	await seedTransaction({
		account: focusedAccount.id,
		owner: user.id,
		date: when11M,
		description: 'Groceries M-11',
		value: -300
	});

	// Other account: large amounts in every window. If the page summed both accounts the
	// per-month averages would balloon into the thousands instead of the focused values.
	await seedTransaction({
		account: otherAccount.id,
		owner: user.id,
		date: when1M,
		description: 'Contract M-1',
		value: 9000
	});
	await seedTransaction({
		account: otherAccount.id,
		owner: user.id,
		date: when1M,
		description: 'Gear M-1',
		value: -3000
	});
	await seedTransaction({
		account: otherAccount.id,
		owner: user.id,
		date: when5M,
		description: 'Contract M-5',
		value: 9000
	});
	await seedTransaction({
		account: otherAccount.id,
		owner: user.id,
		date: when5M,
		description: 'Gear M-5',
		value: -3000
	});
	await seedTransaction({
		account: otherAccount.id,
		owner: user.id,
		date: when11M,
		description: 'Contract M-11',
		value: 9000
	});
	await seedTransaction({
		account: otherAccount.id,
		owner: user.id,
		date: when11M,
		description: 'Gear M-11',
		value: -3000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Accounts', 'Everyday Checking');
	await expect(page.getByRole('heading', { name: 'Everyday Checking' })).toBeVisible();

	const income = page.getByRole('region', { name: 'Income per month' });
	const expenses = page.getByRole('region', { name: 'Expenses per month' });
	const surplus = page.getByRole('region', { name: 'Surplus per month' });

	// 6M totals are $1,500 income and $750 expenses; the other account is excluded.
	await expect(income).toContainText('$250');
	await expect(expenses).toContainText('$125');
	await expect(surplus).toContainText('$125');

	// 3M includes only M-1, averaging $400 income and $200 expenses. The balance history
	// chart has its own period tabs on this page, so scope clicks to the cashflow tablist.
	const cashflowTabs = page.getByRole('tablist', { name: 'Trailing cashflow period' });
	await cashflowTabs.getByRole('tab', { name: '3M' }).click();
	await expect(income).toContainText('$400');
	await expect(expenses).toContainText('$200');
	await expect(surplus).toContainText('$200');

	// 1Y includes all three seed windows, averaging $175 income and $88 expenses.
	await cashflowTabs.getByRole('tab', { name: '1Y' }).click();
	await expect(income).toContainText('$175');
	await expect(expenses).toContainText('$88');
	await expect(surplus).toContainText('$88');
});
