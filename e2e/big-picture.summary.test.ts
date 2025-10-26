import { expect, test } from '@playwright/test';

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
