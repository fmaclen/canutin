import { expect, test } from '@playwright/test';
import { setHours, startOfYear, subDays, subMonths, subYears } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedUser } from './pocketbase.helpers';

test('trends performance single-account baselines', async ({ page }) => {
	const user = await seedUser('steve');

	await page.goto('/');
	await signIn(page, user.email);

	// Seed a single CASH account with balances at known anchors
	const acct = await seedAccount({
		name: 'Perf Test',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});

	const now = new Date();
	const oneWeek = subDays(now, 7);
	const oneMonth = subMonths(now, 1);
	const sixMonths = subMonths(now, 6);
	const oneYear = subYears(now, 1);
	const fiveYears = subYears(now, 5);
	const ytd = startOfYear(now);
	const earliest = subYears(now, 6);

	// Values arranged to produce clean percents
	const baselineByDate: Array<[Date, number]> = [
		[earliest, 1000],
		[fiveYears, 2000],
		[oneYear, 3000],
		[ytd, 4000],
		[sixMonths, 5000],
		[oneMonth, 6000],
		[oneWeek, 7000],
		[now, 8000]
	];

	for (const [d, v] of baselineByDate) {
		await seedAccountBalance({
			account: acct.id,
			owner: user.id,
			asOf: setHours(d, 12).toISOString(),
			value: v
		});
	}

	// Go to Trends > Performance
	const trendsLink = page.getByRole('link', { name: 'Trends' });
	if (!(await trendsLink.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(trendsLink).toBeVisible();
	}
	await trendsLink.click();
	const netRow = page.getByRole('row', { name: /Net worth/ });
	const cells = netRow.getByRole('cell');
	await expect(cells.nth(1).getByRole('button', { name: '+14.3%' })).toBeVisible();
	await expect(cells.nth(2).getByRole('button', { name: '+33.3%' })).toBeVisible();
	await expect(cells.nth(3).getByRole('button', { name: '+60%' })).toBeVisible();
	await expect(cells.nth(4).getByRole('button', { name: '+100%' })).toBeVisible();
	await expect(cells.nth(5).getByRole('button', { name: '+166.7%' })).toBeVisible();
	await expect(cells.nth(6).getByRole('button', { name: '+300%' })).toBeVisible();
	await expect(cells.nth(7).getByRole('button', { name: '+700%' })).toBeVisible();
});
