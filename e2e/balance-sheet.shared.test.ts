import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AccountSharesAccessRoleOptions,
	AccountSharesPerspectiveOptions
} from '../src/lib/pocketbase.schema';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedAccountShare, seedUser } from './pocketbase.helpers';

test('balance sheet groups shared accounts with the recipient own accounts of the same balance type', async ({
	page
}) => {
	const owner = await seedUser('paloma');
	const recipient = await seedUser('tomas');

	// Recipient has her own brokerage accounts.
	const recipientOwnAccount = await seedAccount({
		name: 'IOL (Argentina)',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: recipient.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: recipientOwnAccount.id,
		owner: recipient.id,
		asOf: new Date().toISOString(),
		value: 2500
	});

	// Owner has a brokerage account and shares it with the recipient.
	const ownerSharedAccount = await seedAccount({
		name: 'Diana & Ricardo',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: owner.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: ownerSharedAccount.id,
		owner: owner.id,
		asOf: new Date().toISOString(),
		value: 10000
	});
	await seedAccountShare({
		account: ownerSharedAccount.id,
		recipient: recipient.id,
		recipientEmail: recipient.email,
		grantedBy: owner.id,
		accessRole: AccountSharesAccessRoleOptions.VIEWER,
		perspective: AccountSharesPerspectiveOptions.NORMAL,
		includeInNetWorth: true
	});

	await page.goto('/');
	await signIn(page, recipient.email);
	await goToPageViaSidebar(page, 'Balance sheet');

	const investments = page.getByTestId('INVESTMENT');

	// Ownership must not split the same balance type into duplicate groups.
	const brokerageRegions = investments.getByRole('region', { name: 'Brokerage' });
	await expect(brokerageRegions).toHaveCount(1);

	const brokerageRegion = brokerageRegions.first();
	await expect(brokerageRegion.getByRole('link', { name: 'IOL (Argentina)' })).toBeVisible();
	await expect(brokerageRegion.getByRole('link', { name: 'Diana & Ricardo' })).toBeVisible();

	// Group total must include both accounts.
	await expect(brokerageRegion).toContainText('$12,500');
});
