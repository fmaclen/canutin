import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedUser } from './pocketbase.helpers';

test('big picture summary', async ({ page }) => {
	const user = await seedUser('alice');
	await page.goto('/');
	await signIn(page, user.email);

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	const cash = page.getByRole('region', { name: 'Cash' });
	const investments = page.getByRole('region', { name: 'Investments' });
	const debt = page.getByRole('region', { name: 'Debt' });
	const other = page.getByRole('region', { name: 'Other assets' });
	await expect(netWorth).toContainText('$0');
	await expect(cash).toContainText('$0');
	await expect(investments).toContainText('$0');
	await expect(debt).toContainText('$0');
	await expect(other).toContainText('$0');

	const creditCard = await seedAccount({
		name: 'Alice Limited Rewards',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card'
	});

	await seedAccountBalance({
		account: creditCard.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: -1000
	});

	await expect(netWorth).toContainText('-$1000');
	await expect(debt).toContainText('-$1000');
	await expect(cash).toContainText('$0');
	await expect(investments).toContainText('$0');
	await expect(other).toContainText('$0');
});
