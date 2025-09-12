import { expect, test } from '@playwright/test';
import { addDays, setHours, startOfMonth, subMonths } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedTransaction, seedUser } from './pocketbase.helpers';

// Pick the 15th at local noon for stable month inclusion across timezones
function isoMidOfMonthMonthsAgo(monthsAgo: number) {
	const startThisMonth = startOfMonth(new Date());
	const targetStart = subMonths(startThisMonth, monthsAgo);
	const mid = addDays(targetStart, 14); // 15th
	const atNoon = setHours(mid, 12); // reduce DST/zone edge cases
	return atNoon.toISOString();
}

test('big picture trailing cashflow', async ({ page }) => {
	const user = await seedUser('alice');

	await page.goto('/');
	await signIn(page, user.email);

	// Default tab is 6M
	const income = page.getByRole('region', { name: 'Income per month' });
	const expenses = page.getByRole('region', { name: 'Expenses per month' });
	const surplus = page.getByRole('region', { name: 'Surplus per month' });

	await expect(income).toContainText('$0');
	await expect(expenses).toContainText('$0');
	await expect(surplus).toContainText('$0');

	// Seed a cash account and transactions across different trailing windows
	const account = await seedAccount({
		name: 'Everyday',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});

	const when1M = isoMidOfMonthMonthsAgo(1);
	const when5M = isoMidOfMonthMonthsAgo(5);
	const when11M = isoMidOfMonthMonthsAgo(11);

	// In last month (counts in 3M/6M/1Y): income 1200, expense -600
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: when1M,
		description: 'Paycheck M-1',
		value: 1200
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: when1M,
		description: 'Groceries M-1',
		value: -600
	});

	// In 5 months ago (counts in 6M/1Y only): income 300, expense -150
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: when5M,
		description: 'Paycheck M-5',
		value: 300
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: when5M,
		description: 'Groceries M-5',
		value: -150
	});

	// In 11 months ago (counts in 1Y only): income 600, expense -300
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: when11M,
		description: 'Paycheck M-11',
		value: 600
	});
	await seedTransaction({
		account: account.id,
		owner: user.id,
		date: when11M,
		description: 'Groceries M-11',
		value: -300
	});

	// Expected averages (6M window totals: income 1500, expenses -750)
	// -> per month: income $250, expenses $125, surplus $125
	await expect(income).toContainText('$250');
	await expect(expenses).toContainText('$125');
	await expect(surplus).toContainText('$125');

	// Switch to 3M tab and verify averages scale accordingly
	await page.getByRole('tab', { name: '3M' }).click();
	await expect(income).toContainText('$400');
	await expect(expenses).toContainText('$200');
	await expect(surplus).toContainText('$200');

	// Switch to 1Y tab and verify 12-month averages
	await page.getByRole('tab', { name: '1Y' }).click();
	await expect(income).toContainText('$175');
	await expect(expenses).toContainText('$88');
	await expect(surplus).toContainText('$88');
});
