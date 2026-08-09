import { expect, test } from '@playwright/test';

import { setPlaidItem, stubPlaidWidget, type FakePlaidAccount } from './plaid.helpers';
import {
	formatDateForInput,
	goToEditTab,
	goToPageViaSidebar,
	goToRecordDetail,
	signIn
} from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

const checkingAccount: FakePlaidAccount = {
	account_id: 'fake-checking',
	name: 'Everyday Checking',
	mask: '4321',
	type: 'depository',
	subtype: 'checking',
	balances: { current: 1250.5, iso_currency_code: 'USD' }
};

test('a sync that needs re-authentication is flagged and cleared by reconnecting', async ({
	page
}) => {
	const user = await seedUser('evangeline');
	// The desktop and mobile projects run this test at the same time, so the bank is keyed to the
	// user each run seeds rather than to the test.
	const publicToken = `public-token-${user.id}`;
	const today = formatDateForInput(new Date());
	const firstPage = {
		added: [
			{
				account_id: 'fake-checking',
				transaction_id: 'fake-transaction-rent',
				date: today,
				name: 'Rent',
				original_description: 'Fake Landlord',
				amount: 1200
			}
		]
	};
	const secondPage = {
		added: [
			{
				account_id: 'fake-checking',
				transaction_id: 'fake-transaction-gym',
				date: today,
				name: 'Gym',
				original_description: 'Fake Gym',
				amount: 45
			}
		]
	};

	await setPlaidItem({ publicToken, accounts: [checkingAccount], transactionPages: [firstPage] });
	await stubPlaidWidget(page, { publicToken, institutionName: 'Fake Bank', outcome: 'success' });

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Add account' }).click();
	await page.getByRole('link', { name: 'Link account' }).click();
	await expect(page.getByText('Match accounts')).toBeVisible();

	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Accounts linked', { exact: true })).toBeVisible();

	// The sync the link handshake fires has to land before the bank starts failing, otherwise the
	// error lands on that sync instead of the one this test drives from the connections page.
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Landlord' })).toBeVisible();

	await setPlaidItem({
		publicToken,
		accounts: [checkingAccount],
		transactionPages: [firstPage],
		errors: { '/transactions/sync': 'ITEM_LOGIN_REQUIRED' }
	});
	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Linked institutions' }).click();
	await expect(page).toHaveURL('/settings/connections');
	const connectionRow = page.getByRole('row', { name: 'Fake Bank' });
	await expect(connectionRow).toContainText('Connected');
	await expect(connectionRow).not.toContainText('Reconnection required');

	await connectionRow.getByRole('button', { name: 'Sync' }).click();
	await expect(
		page.getByText('Sync finished with errors: 0 created, 0 skipped, 1 failed')
	).toBeVisible();
	await expect(connectionRow).toContainText('Reconnection required');
	await expect(connectionRow.getByRole('link', { name: 'Reconnect' })).toBeVisible();

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: 'Everyday Checking' })).toContainText(
		'Reconnection required'
	);

	await setPlaidItem({
		publicToken,
		accounts: [checkingAccount],
		transactionPages: [firstPage, secondPage]
	});
	await page.getByRole('link', { name: 'Linked institutions' }).click();
	await connectionRow.getByRole('link', { name: 'Reconnect' }).click();
	await expect(page.getByText('Sync complete: 1 created')).toBeVisible();
	await expect(page).toHaveURL('/settings/connections');
	await expect(connectionRow).toContainText('Connected');
	await expect(connectionRow).not.toContainText('Reconnection required');

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Gym' })).toBeVisible();
});

test('re-syncing adds no duplicates and unlinking leaves the account fully manual', async ({
	page
}) => {
	const user = await seedUser('clementine');
	const publicToken = `public-token-${user.id}`;
	await setPlaidItem({
		publicToken,
		accounts: [checkingAccount],
		transactionPages: [
			{
				added: [
					{
						account_id: 'fake-checking',
						transaction_id: 'fake-transaction-coffee',
						date: formatDateForInput(new Date()),
						name: 'Coffee',
						original_description: 'Fake Coffee Roasters',
						amount: 4.5
					}
				]
			}
		]
	});
	await stubPlaidWidget(page, { publicToken, institutionName: 'Fake Bank', outcome: 'success' });

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Add account' }).click();
	await page.getByRole('link', { name: 'Link account' }).click();
	await expect(page.getByText('Match accounts')).toBeVisible();

	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Accounts linked', { exact: true })).toBeVisible();

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Coffee Roasters' })).toHaveCount(1);

	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Linked institutions' }).click();
	const connectionRow = page.getByRole('row', { name: 'Fake Bank' });
	await expect(connectionRow).toContainText('Connected');

	// The bank has no page left after the first sync, so a second one must find nothing to create.
	await connectionRow.getByRole('button', { name: 'Sync' }).click();
	await expect(page.getByText('Sync complete: 0 created')).toBeVisible();

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Coffee Roasters' })).toHaveCount(1);

	await goToRecordDetail(page, 'Accounts', 'Everyday Checking');
	await goToEditTab(page);
	await expect(page.getByText('Connection', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Institution')).toBeDisabled();
	await expect(page.getByLabel('Category')).toBeDisabled();

	await page.getByRole('link', { name: 'Manage connection' }).click();
	await expect(page).toHaveURL('/settings/connections');

	await connectionRow.getByRole('button', { name: 'Unlink' }).click();
	const unlinkDialog = page.getByRole('alertdialog');
	await expect(unlinkDialog.getByText('Unlink Fake Bank?')).toBeVisible();

	await unlinkDialog.getByRole('button', { name: 'Unlink' }).click();
	await expect(page.getByText('Connection removed from 1 account')).toBeVisible();
	await expect(page.getByText('No banks connected yet')).toBeVisible();

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: 'Everyday Checking' })).not.toContainText('Linked');

	await goToRecordDetail(page, 'Accounts', 'Everyday Checking');
	await goToEditTab(page);
	await expect(page.getByText('Connection', { exact: true })).not.toBeVisible();
	await expect(page.getByLabel('Institution')).toBeEnabled();
	await expect(page.getByLabel('Category')).toBeEnabled();

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Coffee Roasters' })).toHaveCount(1);
});
