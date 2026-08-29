import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	seedAccount,
	seedAccountBalance,
	seedAsset,
	seedAssetBalance,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

test('balance sheet', async ({ page }) => {
	const user = await seedUser('charlie');

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

	await goToPageViaSidebar(page, 'Balance sheet');
	await expect(netWorth).not.toBeVisible();
	await expect(cash).toContainText('$0');
	await expect(investments).toContainText('$0');
	await expect(debt).toContainText('$0');
	await expect(other).toContainText('$0');
	await expect(page.getByText('No accounts or assets for this balance group')).toHaveCount(4);

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

	await expect(debt).toContainText('-$1,000');
	await expect(cash).toContainText('$0');
	await expect(investments).toContainText('$0');
	await expect(other).toContainText('$0');
	await expect(page.getByText('Credit card')).toBeVisible();
	await expect(page.getByText('Savings')).not.toBeVisible();

	const checkingAccount = await seedAccount({
		name: 'Willow Everyday',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Savings'
	});

	await seedAccountBalance({
		account: checkingAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 500
	});

	await expect(cash).toContainText('$500');
	await expect(investments).toContainText('$0');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$0');
	await expect(page.getByText('Savings')).toBeVisible();
	await expect(page.getByText('Credit card')).toBeVisible();
	await expect(page.getByText('Brokerage')).not.toBeVisible();

	const investmentAccount = await seedAccount({
		name: 'Orchard Growth',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});

	await seedAccountBalance({
		account: investmentAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});

	await expect(cash).toContainText('$500');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$0');
	await expect(page.getByText('Savings')).toBeVisible();
	await expect(page.getByText('Credit card')).toBeVisible();
	await expect(page.getByText('Brokerage')).toBeVisible();
	await expect(page.getByText('Paintings')).not.toBeVisible();

	const otherAsset = await seedAsset({
		name: 'Las Meninas',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Paintings'
	});

	await seedAssetBalance({
		asset: otherAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1000
	});

	await expect(cash).toContainText('$500');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');
	await expect(page.getByText('Savings')).toBeVisible();
	await expect(page.getByText('Credit card')).toBeVisible();
	await expect(page.getByText('Brokerage')).toBeVisible();
	await expect(page.getByText('Paintings')).toBeVisible();
	await expect(page.getByText('Checking')).not.toBeVisible();

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
		name: 'Storm on the Sea of Galilee',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Paintings',
		sold: new Date().toISOString()
	});

	await seedAssetBalance({
		asset: soldAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1234
	});

	const excludedAsset = await seedAsset({
		name: 'The Great Wave off Kanagawa',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: user.id,
		balanceType: 'Paintings',
		excluded: new Date().toISOString()
	});

	await seedAssetBalance({
		asset: excludedAsset.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		marketValue: 1234
	});
	const excludedAccount = await seedAccount({
		name: 'Summit Rewards',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: user.id,
		balanceType: 'Credit card',
		excluded: new Date().toISOString()
	});
	await seedAccountBalance({
		account: excludedAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: -2000
	});

	await expect(cash).toContainText('$500');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');

	const creditCardItems = page.getByRole('region', { name: 'Credit card' }).getByRole('listitem');
	await expect(creditCardItems).toHaveCount(2);
	await expect(creditCardItems.nth(0)).toContainText('Summit Rewards');
	await expect(creditCardItems.nth(0)).toContainText('-$2,000');
	await expect(creditCardItems.nth(1)).toContainText('Crescent Classic');
	await expect(creditCardItems.nth(1)).toContainText('-$1,000');

	const excludedBalance = creditCardItems.nth(0).getByRole('button');
	await expect(excludedBalance).toHaveClass(/border-b/);
	await expect(excludedBalance).toHaveClass(/border-dashed/);

	// Hover tooltips are unavailable in mobile projects.
	if (!test.info().project.name.toLowerCase().includes('mobile')) {
		await excludedBalance.hover();
		await expect(
			page.getByText('This account is excluded from totals', { exact: true })
		).toBeVisible();
	}

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
		value: 1500
	});

	await expect(cash).toContainText('$2,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');
	await expect(page.getByText('Savings')).toBeVisible();
	await expect(page.getByText('Credit card')).toBeVisible();
	await expect(page.getByText('Brokerage')).toBeVisible();
	await expect(page.getByText('Paintings')).toBeVisible();
	await expect(page.getByText('Checking')).toBeVisible();

	await seedTransaction({
		account: autoCalculatedAccount.id,
		owner: user.id,
		date: new Date().toISOString(),
		description: 'Transfer',
		value: 1234,
		excluded: new Date().toISOString()
	});

	await expect(cash).toContainText('$2,000');
	await expect(investments).toContainText('$1,000');
	await expect(debt).toContainText('-$1,000');
	await expect(other).toContainText('$1,000');

	const balanceRegions = page.getByTestId('CASH').getByRole('region');
	await expect(balanceRegions).toHaveCount(3);
	await expect(balanceRegions.nth(0)).toContainText('Cash');
	await expect(balanceRegions.nth(0)).toContainText('$2,000');
	await expect(balanceRegions.nth(1)).toContainText('Checking');
	await expect(balanceRegions.nth(1)).toContainText('$1,500');
	await expect(balanceRegions.nth(2)).toContainText('Savings');
	await expect(balanceRegions.nth(2)).toContainText('$500');

	await page.getByRole('link', { name: 'Willow Everyday' }).click();
	await expect(page).toHaveURL(new RegExp(`/accounts/${checkingAccount.id}(\\?|$)`));

	await goToPageViaSidebar(page, 'Balance sheet');
	await page.getByRole('link', { name: 'Las Meninas' }).click();
	await expect(page).toHaveURL(new RegExp(`/assets/${otherAsset.id}(\\?|$)`));
	await expect(page.getByRole('heading', { name: 'Las Meninas' })).toBeVisible();
});
