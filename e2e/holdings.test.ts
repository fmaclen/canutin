import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { getUserPB, seedAccount, seedUser } from './pocketbase.helpers';

test('user can add a holding in an investment account', async ({ page }) => {
	const user = await seedUser('sierra');
	const testToken = user.id.slice(0, 6);
	const accountName = `Retirement Brokerage ${testToken}`;
	const securityName = `Vanguard Total Market ${testToken}`;
	const tickerSymbol = `VTI${testToken.slice(0, 3).toUpperCase()}`;

	await seedAccount({
		name: accountName,
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Holdings');
	await expect(page.getByText('Holdings').first()).toBeVisible();
	await expect(page.getByRole('row', { name: new RegExp(securityName) })).not.toBeVisible();

	await page.getByRole('link', { name: 'Add holding' }).click();
	await expect(page.getByText('Add holding').first()).toBeVisible();
	await page.getByRole('button', { name: 'Add new' }).click();
	await page.getByPlaceholder('Security name').fill(securityName);
	await page.getByPlaceholder('Ticker symbol').fill(tickerSymbol);
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: accountName }).click();
	await page.getByLabel('Quantity').fill('10');
	await page.getByLabel('Market price').fill('100');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Holding added')).toBeVisible();

	const holdingRow = page.getByRole('row', { name: new RegExp(securityName) });
	await expect(holdingRow).toContainText(accountName);
	await expect(holdingRow).toContainText('10');
	await expect(holdingRow).toContainText('$100.00');
	await expect(holdingRow).toContainText('$1,000.00');

	const userPB = await getUserPB(user.email);
	const holding = await userPB
		.collection('holdings')
		.getFirstListItem(`owner = "${user.id}" && quantity = 10`);
	expect('marketValue' in holding).toBe(false);
});

test('user can add a holding with an existing security', async ({ page }) => {
	const user = await seedUser('nora');
	const testToken = user.id.slice(0, 6);
	const accountName = `Nora Brokerage ${testToken}`;
	const securityName = `Nora Index Fund ${testToken}`;
	const tickerSymbol = `NIF${testToken.slice(0, 3).toUpperCase()}`;

	await seedAccount({
		name: accountName,
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const userPB = await getUserPB(user.email);
	await userPB.collection('securities').create({
		owner: user.id,
		name: securityName,
		symbol: tickerSymbol
	});

	await page.goto('/');
	await signIn(page, user.email);
	await page.goto('/holdings/add');
	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: `${securityName} (${tickerSymbol})` }).click();
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: accountName }).click();
	await page.getByLabel('Quantity').fill('4');
	await page.getByLabel('Market price').fill('25');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Holding added')).toBeVisible();

	const holdingRow = page.getByRole('row', { name: new RegExp(securityName) });
	await expect(holdingRow).toContainText(accountName);
	await expect(holdingRow).toContainText('4');
	await expect(holdingRow).toContainText('$25.00');
	await expect(holdingRow).toContainText('$100.00');
});

test('holding rules reject unrelated records and non-investment accounts', async () => {
	const user = await seedUser('marina');
	const otherUser = await seedUser('linus');
	const testToken = user.id.slice(0, 6);
	const otherTestToken = otherUser.id.slice(0, 6);
	const investmentAccount = await seedAccount({
		name: `Marina Brokerage ${testToken}`,
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const cashAccount = await seedAccount({
		name: `Marina Checking ${testToken}`,
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	const userPB = await getUserPB(user.email);
	const otherUserPB = await getUserPB(otherUser.email);
	const security = await userPB.collection('securities').create({
		owner: user.id,
		name: `Marina Index Fund ${testToken}`
	});
	const otherSecurity = await otherUserPB.collection('securities').create({
		owner: otherUser.id,
		name: `Linus Index Fund ${otherTestToken}`
	});

	await expect(
		userPB.collection('holdings').create({
			owner: user.id,
			security: otherSecurity.id,
			account: investmentAccount.id,
			quantity: 1,
			marketPrice: 50
		})
	).rejects.toThrow();
	await expect(
		userPB.collection('holdings').create({
			owner: user.id,
			security: security.id,
			account: cashAccount.id,
			quantity: 1,
			marketPrice: 50
		})
	).rejects.toThrow();

	const holding = await userPB.collection('holdings').create({
		owner: user.id,
		security: security.id,
		account: investmentAccount.id,
		quantity: 1,
		marketPrice: 50
	});
	await expect(
		userPB.collection('holdings').update(holding.id, { marketPrice: 55 })
	).resolves.toMatchObject({
		marketPrice: 55
	});
	await expect(
		userPB.collection('holdings').update(holding.id, { account: cashAccount.id })
	).rejects.toThrow();
	await expect(
		userPB.collection('holdings').update(holding.id, { security: otherSecurity.id })
	).rejects.toThrow();
	await expect(
		userPB.collection('securities').update(security.id, { owner: otherUser.id })
	).rejects.toThrow();
});
