import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions,
	AssetsTypeOptions
} from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getUserPB,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

test('shared inverse account mirrors balances and transactions while allowing recipient-only net worth exclusion', async ({
	page
}) => {
	const owner = await seedUser('ursula');
	const recipient = await seedUser('victor');

	const payableAccount = await seedAccount({
		name: 'Partner payable',
		balanceGroup: AccountsBalanceGroupOptions.DEBT,
		owner: owner.id,
		balanceType: 'Payable'
	});

	await seedAccountBalance({
		account: payableAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: -1200
	});
	await seedTransaction({
		account: payableAccount.id,
		owner: owner.id,
		date: new Date().toISOString(),
		description: 'Repayment',
		value: -200
	});
	const share = await seedAccountShare({
		account: payableAccount.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: true
	});
	const recipientPB = await getUserPB(recipient.email);
	await expect(
		recipientPB.collection('accountShares').update(share.id, { perspective: 'NORMAL' })
	).rejects.toThrow();

	await page.goto('/');
	await signIn(page, recipient.email);

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('$1,200');

	await goToPageViaSidebar(page, 'Accounts');
	const accountRow = page.getByRole('row', { name: /Partner payable/ });
	await expect(accountRow).toBeVisible();
	await expect(accountRow).toContainText('$1,200.00');

	await goToPageViaSidebar(page, 'Transactions');
	const transactionRow = page.getByRole('row', { name: /Repayment/ });
	await expect(transactionRow).toBeVisible();
	await expect(transactionRow.getByText('$200.00')).toBeVisible();

	await page.goto(`/accounts/${payableAccount.id}`);
	await expect(page.getByLabel('Include in my net worth')).toBeChecked();

	await page.getByLabel('Include in my net worth').uncheck();
	await page.getByRole('button', { name: 'Save preferences' }).click();
	await expect(page.getByText('Preferences updated')).toBeVisible();

	await page.goto('/');
	await expect(netWorth).toContainText('$0');

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: /Partner payable/ })).toBeVisible();
});

test('shared inverse asset mirrors value fields while allowing recipient-only net worth exclusion', async ({
	page
}) => {
	const owner = await seedUser('wendy');
	const recipient = await seedUser('xavier');

	const receivableAsset = await seedAsset({
		name: 'Intercompany receivable',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		owner: owner.id,
		balanceType: 'Receivable',
		type: AssetsTypeOptions.WHOLE
	});

	await seedAssetBalance({
		asset: receivableAsset.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		bookValue: 9000,
		marketValue: 12000
	});
	await seedAssetShare({
		asset: receivableAsset.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, recipient.email);

	const netWorth = page.getByRole('region', { name: 'Net worth' });
	await expect(netWorth).toContainText('-$12,000');

	await goToPageViaSidebar(page, 'Assets');
	const assetRow = page.getByRole('row', { name: /Intercompany receivable/ });
	await expect(assetRow).toBeVisible();
	const assetCells = assetRow.locator('td');
	await expect(assetCells.nth(5)).toContainText('-$9,000.00');
	await expect(assetCells.nth(8)).toContainText('-$12,000.00');

	await page.goto(`/assets/${receivableAsset.id}`);
	await expect(page.getByLabel('Include in my net worth')).toBeChecked();

	await page.getByLabel('Include in my net worth').uncheck();
	await page.getByRole('button', { name: 'Save preferences' }).click();
	await expect(page.getByText('Preferences updated')).toBeVisible();

	await page.goto('/');
	await expect(netWorth).toContainText('$0');

	await goToPageViaSidebar(page, 'Assets');
	await expect(page.getByRole('row', { name: /Intercompany receivable/ })).toBeVisible();
});
