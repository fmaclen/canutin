import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import { formatDateForInput, goToPageViaSidebar, signIn } from './playwright.helpers';
import {
	getUserPB,
	seedAccount,
	seedAccountBalance,
	seedSecurity,
	seedSecurityBalance,
	seedSecurityTransaction,
	seedUser
} from './pocketbase.helpers';

test('portfolio and trades flow covers security creation, balances, filters, and cross-links', async ({
	page
}) => {
	const user = await seedUser('willow');
	const brokerageAccount = await seedAccount({
		name: 'Core Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: brokerageAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1000
	});
	const retirementAccount = await seedAccount({
		name: 'Roth Portfolio',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Retirement'
	});
	await seedAccountBalance({
		account: retirementAccount.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 500
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	await expect(page.getByText('No current holdings yet')).toBeVisible();

	await page.goto('/trades/securities');
	await page.getByRole('link', { name: 'Add security' }).click();
	await expect(page).toHaveURL('/trades/securities/add');
	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: 'Add security' }).click();
	await page.getByLabel('Name').fill('Vanguard Total Stock Market ETF');
	await page.getByLabel('Symbol').fill('VTI');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Core Brokerage' }).click();
	await page.getByLabel('As of').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Quantity').fill('10');
	await page.getByLabel('Price').fill('200');
	await page.getByLabel('Value').fill('2000');
	await page.getByLabel('Cost basis').fill('1500');
	await page.getByRole('button', { name: 'Add security' }).click();
	await expect(page.getByText('Security added')).toBeVisible();
	await expect(page).toHaveURL('/trades/securities');
	const securityRow = page.getByRole('row', { name: /Vanguard Total Stock Market ETF/ });
	await expect(securityRow).toContainText('VTI');

	await page.goto('/portfolio');
	const portfolioRow = page.getByRole('row', { name: /Vanguard Total Stock Market ETF/ });
	await expect(portfolioRow).toBeVisible();
	await expect(portfolioRow).toContainText('VTI');
	await expect(portfolioRow).toContainText('Core Brokerage');
	await expect(portfolioRow).toContainText('10');
	await expect(portfolioRow).toContainText('$2,000.00');
	await expect(portfolioRow).toContainText('$1,500.00');
	await expect(portfolioRow).toContainText('$500.00');

	await portfolioRow.getByRole('link', { name: 'Vanguard Total Stock Market ETF' }).click();
	await expect(page).toHaveURL(/\/trades\/securities\//);
	const securityUrl = page.url();
	const securityId = securityUrl.split('/trades/securities/')[1].split('?')[0];
	const firstAccountRow = page.getByRole('row', { name: /Core Brokerage/ });
	await expect(firstAccountRow).toContainText('10');
	await expect(firstAccountRow).toContainText('$200.00');
	await expect(firstAccountRow).toContainText('$2,000.00');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Roth Portfolio' }).click();
	await page.getByLabel('As of').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Quantity').fill('5');
	await page.getByLabel('Price').fill('210');
	await page.getByLabel('Value').fill('1050');
	await page.getByLabel('Cost basis').fill('900');
	await page.getByRole('button', { name: 'Add balance' }).click();
	await expect(page.getByRole('row', { name: /Roth Portfolio/ })).toContainText('$1,050.00');
	await expect(page.getByRole('row', { name: /Total/ })).toContainText('$3,050.00');

	await page.goto(`/accounts/${brokerageAccount.id}`);
	await expect(page.getByText('Cash balance only')).toBeVisible();
	await expect(page.getByRole('row', { name: /Cash balance/ })).toContainText('$1,000.00');
	await expect(page.getByRole('row', { name: /Vanguard Total Stock Market ETF/ })).toContainText(
		'$2,000.00'
	);
	await expect(page.getByRole('row', { name: /Holdings value/ })).toContainText('$2,000.00');
	await expect(page.getByRole('row', { name: /Total balance/ })).toContainText('$3,000.00');
	await page.getByRole('main').getByRole('link', { name: 'Trades' }).click();
	await expect(page).toHaveURL(`/trades?account=${brokerageAccount.id}`);
	await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText(
		'Core Brokerage'
	);

	await page.goto(`/trades/securities/${securityId}`);
	await page.getByRole('main').getByRole('link', { name: 'Trades' }).click();
	await expect(page).toHaveURL(`/trades?security=${securityId}`);
	await expect(page.getByRole('button', { name: 'Security', exact: true })).toContainText(
		'Vanguard Total Stock Market ETF'
	);

	await page.getByRole('link', { name: 'Add trade' }).click();
	await expect(page).toHaveURL('/trades/add');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Core Brokerage' }).click();
	await page.getByLabel('Date').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: 'Vanguard Total Stock Market ETF' }).click();
	await page.getByLabel('Description').fill('Initial VTI buy');
	await page.getByLabel('Quantity').fill('10');
	await page.getByLabel('Price').fill('200');
	await page.getByLabel('Amount').fill('2000');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Trade added')).toBeVisible();
	await expect(page).toHaveURL('/trades');
	const activityRow = page.getByRole('row', { name: /Initial VTI buy/ });
	await expect(activityRow).toBeVisible();
	await expect(activityRow).toContainText('Vanguard Total Stock Market ETF');
	await expect(activityRow).toContainText('Buy');
	await expect(activityRow).toContainText('Core Brokerage');
	await page.getByRole('button', { name: 'Account', exact: true }).click();
	await page.getByRole('option', { name: 'Roth Portfolio' }).click();
	await expect(activityRow).not.toBeVisible();
	await page.getByRole('button', { name: 'Account', exact: true }).click();
	await page.getByRole('option', { name: 'Core Brokerage' }).click();
	await expect(activityRow).toBeVisible();
});

test('portfolio unknown values render as unknown and do not inflate account totals', async ({
	page
}) => {
	const user = await seedUser('yara');
	const account = await seedAccount({
		name: 'Unknown Value Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 750
	});
	const security = await seedSecurity({ name: 'Private Fund', symbol: 'PFND', owner: user.id });
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: new Date().toISOString(),
		quantity: 3,
		price: null,
		value: null,
		costBasis: 300
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	const row = page.getByRole('row', { name: /Private Fund/ });
	await expect(row).toContainText('PFND');
	await expect(row.locator('td').nth(4)).toHaveText('~');

	await page.goto(`/accounts/${account.id}`);
	await expect(page.getByRole('row', { name: /Cash balance/ })).toContainText('$750.00');
	await expect(page.getByRole('row', { name: /Holdings value/ })).toContainText('~');
	await expect(page.getByRole('row', { name: /Total balance/ })).toContainText('$750.00');
});

test('portfolio hides sold-out positions while preserving activity history', async ({ page }) => {
	const user = await seedUser('zane');
	const account = await seedAccount({
		name: 'Sold Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Round Trip Stock', symbol: 'RTS', owner: user.id });
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: '2026-01-01',
		quantity: 8,
		price: 50,
		value: 400,
		costBasis: 320
	});
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: '2026-02-01',
		quantity: 0,
		price: 60,
		value: 0,
		costBasis: 0
	});
	await seedSecurityTransaction({
		account: account.id,
		owner: user.id,
		security: security.id,
		date: '2026-02-01',
		type: SecurityTransactionsTypeOptions.sell,
		description: 'Exit Round Trip Stock',
		quantity: 8,
		price: 60,
		amount: 480
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	await expect(page.getByRole('row', { name: /Round Trip Stock/ })).not.toBeVisible();

	await page.goto('/trades/securities');
	await expect(page.getByRole('row', { name: /Round Trip Stock/ })).toBeVisible();

	await page.goto('/trades');
	await expect(page.getByRole('row', { name: /Exit Round Trip Stock/ })).toBeVisible();
});

test('transactions and portfolio add forms show empty prerequisites with no accounts', async ({
	page
}) => {
	const user = await seedUser('opal');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Transactions');
	await page.getByRole('link', { name: 'Add transaction' }).click();
	await page.getByLabel('Account').click();
	await expect(page.getByRole('option', { name: 'No accounts yet' })).toBeVisible();

	await page.goto('/trades/add');
	await page.getByLabel('Account').click();
	await expect(page.getByRole('option', { name: 'No accounts yet' })).toBeVisible();
	await page.getByLabel('Security').click();
	await expect(page.getByRole('option', { name: 'No securities yet' })).toBeVisible();

	await page.goto('/trades/securities/add');
	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: 'Add security' }).click();
	await page.getByLabel('Account').click();
	await expect(page.getByRole('option', { name: 'No accounts yet' })).toBeVisible();
});

test('trades and securities empty prerequisites stay consistent', async ({ page }) => {
	const user = await seedUser('nova');
	const account = await seedAccount({
		name: 'Empty Prerequisite Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Trades');
	await expect(page.getByText('No trades match your filters')).toBeVisible();

	await page.getByRole('link', { name: 'Add trade' }).click();
	await page.getByLabel('Security').click();
	await expect(page.getByRole('option', { name: 'No securities yet' })).toBeVisible();

	await goToPageViaSidebar(page, 'Securities');
	await expect(page.getByText('No securities yet')).toBeVisible();
	await page.getByRole('link', { name: 'Add security' }).click();
	await page.getByLabel('Security').click();
	await page.getByRole('option', { name: 'Add security' }).click();
	await page.getByLabel('Name').fill('Empty Flow Fund');
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Empty Prerequisite Brokerage' }).click();
	await page.getByLabel('As of').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Quantity').fill('1');
	await page.getByLabel('Price').fill('25');
	await page.getByLabel('Value').fill('25');
	await page.getByRole('button', { name: 'Add security' }).click();
	await expect(page.getByRole('row', { name: /Empty Flow Fund/ })).toBeVisible();

	await goToPageViaSidebar(page, 'Trades');
	await page.getByRole('link', { name: 'Add trade' }).click();
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: account.name }).click();
	await page.getByLabel('Date').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Security').click();
	await expect(page.getByRole('option', { name: 'Empty Flow Fund' })).toBeVisible();
});

test('portfolio backend integrity rejects cross-owner balance writes', async () => {
	const user = await seedUser('ivy');
	const otherUser = await seedUser('jules');
	const account = await seedAccount({
		name: 'Integrity Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const closedAccount = await seedAccount({
		name: 'Closed Integrity Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage',
		closed: new Date().toISOString()
	});
	const security = await seedSecurity({ name: 'Integrity ETF', symbol: 'IETF', owner: user.id });
	const otherSecurity = await seedSecurity({
		name: 'Other Integrity ETF',
		symbol: 'OIETF',
		owner: otherUser.id
	});
	const pb = await getUserPB(user.email);

	await expect(
		pb.collection('securityBalances').create({
			account: account.id,
			owner: user.id,
			security: otherSecurity.id,
			asOf: new Date().toISOString(),
			quantity: 1,
			price: 10,
			value: 10
		})
	).rejects.toThrow();
	const balance = await pb.collection('securityBalances').create({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: new Date().toISOString(),
		quantity: 1,
		price: 10,
		value: 10
	});
	expect(balance).toMatchObject({ account: account.id, security: security.id });
	await expect(
		pb.collection('securityBalances').create({
			account: closedAccount.id,
			owner: user.id,
			security: security.id,
			asOf: new Date().toISOString(),
			quantity: 1,
			price: 10,
			value: 10
		})
	).rejects.toThrow();
	await expect(
		pb.collection('securityBalances').update(balance.id, { owner: otherUser.id })
	).rejects.toThrow();
	await expect(
		pb.collection('securityBalances').update(balance.id, { account: closedAccount.id })
	).rejects.toThrow();
	await expect(
		pb.collection('securities').update(security.id, { owner: otherUser.id })
	).rejects.toThrow();
	const transaction = await pb.collection('securityTransactions').create({
		account: account.id,
		owner: user.id,
		security: security.id,
		date: new Date().toISOString(),
		type: SecurityTransactionsTypeOptions.buy,
		description: 'Integrity buy',
		quantity: 1,
		price: 10,
		amount: 10
	});
	await expect(
		pb.collection('securityTransactions').create({
			account: closedAccount.id,
			owner: user.id,
			security: security.id,
			date: new Date().toISOString(),
			type: SecurityTransactionsTypeOptions.buy,
			description: 'Closed account buy',
			quantity: 1,
			price: 10,
			amount: 10
		})
	).rejects.toThrow();
	await expect(
		pb.collection('securityTransactions').update(transaction.id, { owner: otherUser.id })
	).rejects.toThrow();
	await expect(
		pb.collection('securityTransactions').update(transaction.id, { account: closedAccount.id })
	).rejects.toThrow();
});
