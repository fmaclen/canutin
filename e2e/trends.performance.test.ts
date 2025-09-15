import { expect, test } from '@playwright/test';
import { setHours, startOfYear, subDays, subMonths, subYears } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedUser } from './pocketbase.helpers';

test('trends performance with cash + debt baselines', async ({ page }) => {
    const user = await seedUser('steve');

	await page.goto('/');
	await signIn(page, user.email);

    // Seed a CASH account with balances at known anchors
    const cashAcct = await seedAccount({
        name: 'Perf Test',
        balanceGroup: AccountsBalanceGroupOptions.CASH,
        owner: user.id,
        balanceType: 'Checking'
    });
    // And a DEBT account with its own baseline series
    const debtAcct = await seedAccount({
        name: 'Perf Debt',
        balanceGroup: AccountsBalanceGroupOptions.DEBT,
        owner: user.id,
        balanceType: 'Credit card'
    });

	const now = new Date();
	const oneWeek = subDays(now, 7);
	const oneMonth = subMonths(now, 1);
	const sixMonths = subMonths(now, 6);
	const oneYear = subYears(now, 1);
	const fiveYears = subYears(now, 5);
	const ytd = startOfYear(now);
	const earliest = subYears(now, 6);

    // Cash values arranged to produce clean percents
    const baselineCash: Array<[Date, number]> = [
        [earliest, 1000],
        [fiveYears, 2000],
        [oneYear, 3000],
        [ytd, 4000],
        [sixMonths, 5000],
        [oneMonth, 6000],
        [oneWeek, 7000],
        [now, 8000]
    ];

    for (const [d, v] of baselineCash) {
        await seedAccountBalance({
            account: cashAcct.id,
            owner: user.id,
            asOf: setHours(d, 12).toISOString(),
            value: v
        });
    }

    // Debt series more negative in the past, improving towards now
    const baselineDebt: Array<[Date, number]> = [
        [earliest, -1000],
        [fiveYears, -2000],
        [oneYear, -2500],
        [ytd, -3000],
        [sixMonths, -3500],
        [oneMonth, -3200],
        [oneWeek, -3100],
        [now, -3000]
    ];

    for (const [d, v] of baselineDebt) {
        await seedAccountBalance({
            account: debtAcct.id,
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
    // Assert Net worth row (Cash + Debt)
    const netRow = page.getByRole('row', { name: /Net worth/ });
    const cells = netRow.getByRole('cell');
    await expect(cells.nth(1).getByRole('button', { name: '+28.2%' })).toBeVisible();
    await expect(cells.nth(2).getByRole('button', { name: '+78.6%' })).toBeVisible();
    await expect(cells.nth(3).getByRole('button', { name: '+233.3%' })).toBeVisible();
    await expect(cells.nth(4).getByRole('button', { name: '+400%' })).toBeVisible();
    await expect(cells.nth(5).getByRole('button', { name: '+900%' })).toBeVisible();
    await expect(cells.nth(6)).toContainText('~');
    await expect(cells.nth(7).getByRole('button', { name: '+900%' })).toBeVisible();

    // Assert Cash row
    const cashRow = page.getByRole('row', { name: /^Cash/ });
    const cashCells = cashRow.getByRole('cell');
    await expect(cashCells.nth(1).getByRole('button', { name: '+14.3%' })).toBeVisible();
    await expect(cashCells.nth(2).getByRole('button', { name: '+33.3%' })).toBeVisible();
    await expect(cashCells.nth(3).getByRole('button', { name: '+60%' })).toBeVisible();
    await expect(cashCells.nth(4).getByRole('button', { name: '+100%' })).toBeVisible();
    await expect(cashCells.nth(5).getByRole('button', { name: '+166.7%' })).toBeVisible();
    await expect(cashCells.nth(6).getByRole('button', { name: '+300%' })).toBeVisible();
    await expect(cashCells.nth(7).getByRole('button', { name: '+700%' })).toBeVisible();

    // Assert Debt row
    const debtRow = page.getByRole('row', { name: /^Debt/ });
    const debtCells = debtRow.getByRole('cell');
    await expect(debtCells.nth(1).getByRole('button', { name: '-3.2%' })).toBeVisible();
    await expect(debtCells.nth(2).getByRole('button', { name: '-6.3%' })).toBeVisible();
    await expect(debtCells.nth(3).getByRole('button', { name: '-14.3%' })).toBeVisible();
    await expect(debtCells.nth(4).getByRole('button', { name: '0%' })).toBeVisible();
    await expect(debtCells.nth(5).getByRole('button', { name: '+20%' })).toBeVisible();
    await expect(debtCells.nth(6).getByRole('button', { name: '+50%' })).toBeVisible();
    await expect(debtCells.nth(7).getByRole('button', { name: '+200%' })).toBeVisible();
});
