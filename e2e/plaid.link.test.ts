import { expect, test } from '@playwright/test';
import { subDays } from 'date-fns';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { setPlaidItem, stubPlaidWidget } from './plaid.helpers';
import { formatDateForInput, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getUserPB,
	listAccountBalances,
	seedAccount,
	seedAccountBalance,
	seedTransaction,
	seedUser
} from './pocketbase.helpers';

test('links a bank through the Plaid widget and syncs its transactions', async ({ page }) => {
	const user = await seedUser('marcel');
	// The desktop and mobile projects run this test at the same time, so the bank is keyed to the
	// user each run seeds rather than to the test.
	const publicToken = `public-token-${user.id}`;
	await setPlaidItem({
		publicToken,
		accounts: [
			{
				account_id: 'fake-checking',
				name: 'Everyday Checking',
				mask: '4321',
				type: 'depository',
				subtype: 'checking',
				balances: { current: 1250.5, iso_currency_code: 'USD' }
			}
		],
		transactionPages: [
			{
				added: [
					{
						account_id: 'fake-checking',
						transaction_id: 'fake-transaction',
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
	await expect(page).toHaveURL('/accounts/add');
	await expect(page.getByRole('link', { name: 'Link account' })).toBeVisible();
	await expect(page.getByText('Match accounts')).not.toBeVisible();

	await page.getByRole('link', { name: 'Link account' }).click();
	await expect(page.getByText('Match accounts')).toBeVisible();
	await expect(page.getByLabel('Institution')).toHaveValue('Fake Bank');
	await expect(page.getByLabel('Account', { exact: true })).toHaveValue('4321 · Everyday Checking');
	await expect(page.getByLabel('Type')).toHaveValue('Checking');
	await expect(page.getByLabel('Balance', { exact: true })).toHaveValue('$1,250.50');

	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Accounts linked', { exact: true })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Everyday Checking' })).toBeVisible();

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Coffee Roasters' })).toBeVisible();
});

test('matches an existing account, adopts its transaction, and preserves derived history', async ({
	page
}) => {
	const user = await seedUser('lucien');
	const publicToken = `public-token-${user.id}`;
	const matchedAt = new Date();
	const openingDate = formatDateForInput(subDays(matchedAt, 30));
	const matchedDate = formatDateForInput(matchedAt);

	const existingAccount = await seedAccount({
		name: 'Household Checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Checking',
		owner: user.id,
		autoCalculated: new Date().toISOString()
	});
	await seedTransaction({
		account: existingAccount.id,
		owner: user.id,
		date: `${openingDate}T12:00:00.000Z`,
		description: 'Opening deposit',
		value: 100
	});
	// Same account, day and amount as the Plaid transaction below, so the first sync has an
	// unambiguous manual counterpart to adopt instead of a second copy to create.
	await seedTransaction({
		account: existingAccount.id,
		owner: user.id,
		date: `${matchedDate}T12:00:00.000Z`,
		description: 'Fake Coffee Roasters',
		value: -4.5
	});

	await setPlaidItem({
		publicToken,
		accounts: [
			{
				account_id: 'fake-checking',
				name: 'Everyday Checking',
				mask: '4321',
				type: 'depository',
				subtype: 'checking',
				balances: { current: 1250.5, iso_currency_code: 'USD' }
			},
			{
				account_id: 'fake-credit',
				name: 'Platinum Card',
				mask: '1111',
				type: 'credit',
				subtype: 'credit card',
				balances: { current: 450, iso_currency_code: 'USD' }
			}
		],
		transactionPages: [
			{
				added: [
					{
						account_id: 'fake-checking',
						transaction_id: 'fake-transaction-coffee',
						date: matchedDate,
						name: 'Coffee',
						original_description: 'Fake Coffee Roasters',
						amount: 4.5
					},
					{
						account_id: 'fake-checking',
						transaction_id: 'fake-transaction-books',
						date: matchedDate,
						name: 'Books',
						original_description: 'Fake Bookstore',
						amount: 18
					}
				]
			}
		]
	});
	await stubPlaidWidget(page, { publicToken, institutionName: 'Fake Bank', outcome: 'success' });

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Coffee Roasters' })).toHaveCount(1);
	await expect(page.getByRole('row', { name: 'Fake Bookstore' })).toHaveCount(0);

	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Add account' }).click();
	await page.getByRole('link', { name: 'Link account' }).click();
	await expect(page.getByText('Match accounts')).toBeVisible();

	// The form is one fieldset for the institution followed by one per bank account, in the order
	// Plaid returned them; the account names below confirm which fieldset is which.
	const fieldsets = page.getByRole('group');
	await expect(fieldsets).toHaveCount(3);
	const checkingFields = fieldsets.nth(1);
	const creditCardFields = fieldsets.nth(2);
	await expect(checkingFields.getByLabel('Account', { exact: true })).toHaveValue(
		'4321 · Everyday Checking'
	);
	await expect(creditCardFields.getByLabel('Account', { exact: true })).toHaveValue(
		'1111 · Platinum Card'
	);
	await expect(creditCardFields.getByLabel('Type')).toHaveValue('Credit Card');
	await expect(creditCardFields.getByLabel('Balance', { exact: true })).toHaveValue('-$450.00');

	await checkingFields.getByLabel('Link to').click();
	await page.getByRole('option', { name: 'Household Checking' }).click();
	await expect(checkingFields.getByLabel('Link to')).toContainText('Household Checking');

	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Accounts linked', { exact: true })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Household Checking' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Everyday Checking' })).toHaveCount(0);

	const userPB = await getUserPB(user.email);
	const linkedAccount = await userPB.collection('accounts').getOne(existingAccount.id);
	const materializedHistory = (await listAccountBalances(userPB, existingAccount.id))
		.filter(
			(balance) =>
				balance.source === 'derived' &&
				[openingDate, matchedDate].includes(balance.asOf.slice(0, 10))
		)
		.map((balance) => ({ date: balance.asOf.slice(0, 10), value: balance.value }))
		.sort((left, right) => left.date.localeCompare(right.date));
	expect(linkedAccount.autoCalculated).toBe('');
	expect(materializedHistory).toEqual([
		{ date: openingDate, value: 100 },
		{ date: matchedDate, value: 95.5 }
	]);

	// The new transaction landing is what proves the sync ran, so the coffee count below is read
	// after the reconciliation had its chance to duplicate it.
	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('row', { name: 'Fake Bookstore' })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Fake Coffee Roasters' })).toHaveCount(1);

	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: 'Platinum Card' })).toContainText('-$450.00');
});

test('derives investment cash when linking to an existing account', async ({ page }) => {
	const user = await seedUser('desmond');
	const publicToken = `public-token-${user.id}`;
	const existingAccount = await seedAccount({
		name: 'Retirement Fund',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage',
		owner: user.id
	});
	await seedAccountBalance({
		account: existingAccount.id,
		owner: user.id,
		asOf: '2020-01-01T12:00:00.000Z',
		value: 700
	});
	await setPlaidItem({
		publicToken,
		accounts: [
			{
				account_id: 'fake-investment',
				name: 'Investment Account',
				mask: '6789',
				type: 'investment',
				subtype: 'brokerage',
				balances: { current: 1000, iso_currency_code: 'USD' }
			}
		],
		holdings: [
			{
				account_id: 'fake-investment',
				security_id: 'fake-security',
				quantity: 8,
				institution_price: 100,
				institution_value: 800
			}
		],
		securities: [
			{
				security_id: 'fake-security',
				name: 'Fake Index Fund',
				ticker_symbol: 'FAKE',
				type: 'equity',
				iso_currency_code: 'USD'
			}
		]
	});
	await stubPlaidWidget(page, {
		publicToken,
		institutionName: 'Fake Brokerage',
		outcome: 'success'
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await expect(page.getByRole('row', { name: 'Retirement Fund' })).toContainText('$700.00');

	await page.getByRole('link', { name: 'Add account' }).click();
	await page.getByRole('link', { name: 'Link account' }).click();
	await expect(page.getByText('Match accounts')).toBeVisible();

	await page.getByLabel('Link to').click();
	await page.getByRole('option', { name: 'Retirement Fund' }).click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Accounts linked', { exact: true })).toBeVisible();
	await expect(page.getByRole('row', { name: 'Retirement Fund' })).toContainText('$1,000.00');
});

test('discarding the match step deletes the bank connection', async ({ page }) => {
	const user = await seedUser('rosalind');
	const publicToken = `public-token-${user.id}`;
	await setPlaidItem({
		publicToken,
		accounts: [
			{
				account_id: 'fake-checking',
				name: 'Everyday Checking',
				mask: '4321',
				type: 'depository',
				subtype: 'checking',
				balances: { current: 1250.5, iso_currency_code: 'USD' }
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
	await expect(page.getByRole('alertdialog')).not.toBeVisible();

	await page.getByRole('button', { name: 'Cancel' }).click();
	const discardDialog = page.getByRole('alertdialog');
	await expect(discardDialog.getByText('Discard this bank connection?')).toBeVisible();

	await discardDialog.getByRole('button', { name: 'Discard connection' }).click();
	await expect(page).toHaveURL('/accounts');
	await expect(page.getByText('No open accounts yet')).toBeVisible();

	await page.getByRole('link', { name: 'Linked institutions' }).click();
	await expect(page).toHaveURL('/settings/connections');
	await expect(page.getByText('No banks connected yet')).toBeVisible();
});

test('account linking is unavailable when the server has no Plaid credentials', async ({
	page
}) => {
	const user = await seedUser('bartholomew');
	// The backend under test is always configured, so the "not configured" answer is injected in the
	// browser instead of on the server.
	await page.route('**/api/canutin/plaid/link-token', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'plaid_not_configured' })
		})
	);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Linked institutions' }).click();
	await expect(page.getByText('Account linking is not set up on this server')).toBeVisible();
	await expect(page.getByText('No banks connected yet')).not.toBeVisible();

	await goToPageViaSidebar(page, 'Accounts');
	await page.getByRole('link', { name: 'Add account' }).click();
	await expect(page.getByText('Account linking is not set up on this server')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Link account' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Add manually' })).toBeVisible();
});
