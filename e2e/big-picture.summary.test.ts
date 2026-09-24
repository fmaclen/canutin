import { expect, test } from '@playwright/test';
import { subDays } from 'date-fns';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedSecurity,
	seedSecurityBalance,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

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
		name: 'Crescent Classic',
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

	await expect(netWorth).toContainText('-$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(cash).toContainText('$0');
	await expect(investments).toContainText('$0');
	await expect(other).toContainText('$0');

	const checkingAccount = await seedAccount({
		name: 'Willow Everyday',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});

	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	await expect(netWorth).toContainText('$0');
	await expect(cash).toContainText('$1,000');
	await expect(investments).toContainText('$0');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$0');

	const investmentAccount = await seedAccount({
		name: 'Orchard Growth',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Investment'
	});

	await seedAccountBalance({
		account: investmentAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	await expect(netWorth).toContainText('$1,000');
	await expect(cash).toContainText('$1,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$0');

	const otherAsset = await seedAsset({
		name: 'Decorative Sculpture',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Other asset'
	});

	await seedAssetBalance({
		asset: otherAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1000
	});

	await expect(netWorth).toContainText('$2,000');
	await expect(cash).toContainText('$1,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');

	const closedAccount = await seedAccount({
		name: 'Harbor Legacy',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		closed: new Date().toISOString()
	});

	await seedAccountBalance({
		account: closedAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1234
	});

	const soldAsset = await seedAsset({
		name: 'Decorative Sculpture',
		balanceGroup: AssetsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Other asset',
		sold: new Date().toISOString()
	});

	await seedAssetBalance({
		asset: soldAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1234
	});

	const excludedAsset = await seedAsset({
		name: 'Decorative Sculpture',
		balanceGroup: AssetsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Other asset',
		excluded: new Date().toISOString()
	});

	await seedAssetBalance({
		asset: excludedAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1234
	});

	await expect(netWorth).toContainText('$2,000');
	await expect(cash).toContainText('$1,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');

	const autoCalculatedAccount = await seedAccount({
		name: 'Maple Reserve',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		autoCalculated: new Date().toISOString()
	});

	await seedTransaction({
		account: autoCalculatedAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Payroll',
		value: 1000
	});

	await expect(netWorth).toContainText('$3,000');
	await expect(cash).toContainText('$2,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');

	await seedTransaction({
		account: autoCalculatedAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Transfer',
		value: 1234,
		excluded: new Date().toISOString()
	});

	await expect(netWorth).toContainText('$3,000');
	await expect(cash).toContainText('$2,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');
});

test('big picture summary waits for every balance before showing totals', async ({ page }) => {
	const user = await seedUser('ambrose');
	const checkingAccount = await seedAccount({
		name: 'Willow Everyday',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking'
	});
	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});
	const brokerageAccount = await seedAccount({
		name: 'Orchard Growth',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Orchard Index Fund', owner: user.id });
	await seedSecurityBalance({
		account: brokerageAccount.id,
		security: security.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		quantity: 5,
		price: 100,
		value: 500
	});

	// Hold the holdings request until every other store the totals read from has committed, so a
	// summary that rendered early would show the cash-only $1,000.
	let releaseSecurityBalances!: () => void;
	const securityBalancesReleased = new Promise<void>((resolve) => {
		releaseSecurityBalances = resolve;
	});
	await page.route('**/api/collections/latestSecurityBalances/records**', async (route) => {
		await securityBalancesReleased;
		await route.continue();
	});
	const otherStoresLoaded = Promise.all([
		page.waitForResponse('**/api/collections/latestAssetBalances/records**'),
		page.waitForResponse('**/api/collections/currencies/records**'),
		page.waitForResponse('**/api/collections/exchangeRates/records**')
	]);

	await page.goto('/');
	await signIn(page, user.email);
	await otherStoresLoaded;
	const netWorth = page.getByRole('region', { name: 'Net worth' });
	const cash = page.getByRole('region', { name: 'Cash' });
	const investments = page.getByRole('region', { name: 'Investments' });
	// The trailing cashflow only fetches once the accounts have committed, so its averages
	// settling proves the accounts are in as well.
	await expect(page.getByRole('region', { name: 'Income per month' })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(netWorth).toHaveAttribute('aria-busy', 'true');
	await expect(netWorth).not.toContainText('$');
	await expect(cash).not.toContainText('$');
	await expect(investments).not.toContainText('$');

	releaseSecurityBalances();
	await expect(netWorth).toHaveAttribute('aria-busy', 'false');
	await expect(netWorth).toContainText('$1,500');
	await expect(cash).toContainText('$1,000');
	await expect(investments).toContainText('$500');
});

test('big picture summary updates holdings in realtime without reloading', async ({ page }) => {
	const user = await seedUser('leopold');
	const brokerageAccount = await seedAccount({
		name: 'Orchard Growth',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Orchard Index Fund', owner: user.id });
	await seedSecurityBalance({
		account: brokerageAccount.id,
		security: security.id,
		owner: user.id,
		asOf: subDays(new Date(), 1).toISOString(),
		quantity: 5,
		price: 100,
		value: 500
	});

	await page.goto('/');
	await signIn(page, user.email);
	const netWorth = page.getByRole('region', { name: 'Net worth' });
	const investments = page.getByRole('region', { name: 'Investments' });
	await expect(netWorth).toContainText('$500');
	await expect(investments).toContainText('$500');

	// Flag the region if it ever returns to its loading state, so a skeleton flashing during the
	// realtime refresh fails the test even though it is gone by the time the new total lands.
	await netWorth.evaluate((region) => {
		new MutationObserver(() => {
			if (region.getAttribute('aria-busy') === 'true') region.dataset.wentBusy = 'true';
		}).observe(region, { attributeFilter: ['aria-busy'] });
	});
	await seedSecurityBalance({
		account: brokerageAccount.id,
		security: security.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		quantity: 5,
		price: 150,
		value: 750
	});
	await expect(netWorth).toContainText('$750');
	await expect(investments).toContainText('$750');
	await expect(netWorth).not.toHaveAttribute('data-went-busy');
});
