import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedUser } from './pocketbase.helpers';

test.skip(({ isMobile }) => isMobile, 'Trends reconnect recovery is desktop-only');

test('trends recovers a balance missed while disconnected', async ({ page }) => {
	const user = await seedUser('eudora');
	const account = await seedAccount({
		name: 'Reconnect checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Trends');
	const maxPerformance = page.getByRole('row', { name: /^Cash/ }).getByRole('cell').nth(8);
	await expect(maxPerformance.getByRole('button', { name: '0%' })).toBeVisible();

	await page.context().setOffline(true);
	const missedBalance = await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 2000
	});
	await expect(maxPerformance.getByRole('button', { name: '0%' })).toBeVisible();

	await Promise.all([
		page.waitForResponse(async (response) => {
			const url = new URL(response.url());
			return (
				response.request().method() === 'GET' &&
				url.pathname.endsWith('/api/collections/accountBalances/records') &&
				url.searchParams.get('fields') === 'id,account,value,asOf,created' &&
				(await response.text()).includes(missedBalance.id)
			);
		}),
		page.context().setOffline(false)
	]);
	await expect(maxPerformance.getByRole('button', { name: '+100%' })).toBeVisible();
});
