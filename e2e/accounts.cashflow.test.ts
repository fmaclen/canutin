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

	// Focused account: income 1200/300/600, expenses -600/-150/-300 across the windows
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
	await page.goto(`/accounts/${focusedAccount.id}`);
	await expect(page.getByRole('heading', { name: 'Everyday Checking' })).toBeVisible();

	const income = page.getByRole('region', { name: 'Income per month' });
	const expenses = page.getByRole('region', { name: 'Expenses per month' });
	const surplus = page.getByRole('region', { name: 'Surplus per month' });

	// Default tab is 6M: focused account income 1500, expenses -750 over 6 months
	// -> per month: income $250, expenses $125, surplus $125 (ignores the other account)
	await expect(income).toContainText('$250');
	await expect(expenses).toContainText('$125');
	await expect(surplus).toContainText('$125');

	// 3M tab: only the M-1 window counts -> income $400, expenses $200, surplus $200
	await page.getByRole('tab', { name: '3M' }).click();
	await expect(income).toContainText('$400');
	await expect(expenses).toContainText('$200');
	await expect(surplus).toContainText('$200');

	// 1Y tab: all three windows count -> income $175, expenses $88, surplus $88
	await page.getByRole('tab', { name: '1Y' }).click();
	await expect(income).toContainText('$175');
	await expect(expenses).toContainText('$88');
	await expect(surplus).toContainText('$88');
});
