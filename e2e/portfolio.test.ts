import { UTCDate } from '@date-fns/utc';
import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	SecurityTransactionsTypeOptions
} from '../src/lib/pocketbase.schema';
import {
	formatDateForInput,
	goToAddPage,
	goToEditTab,
	goToPageViaSidebar,
	goToRecordDetail,
	signIn
} from './playwright.helpers';
import {
	getUserPB,
	seedAccount,
	seedAccountBalance,
	seedSecurity,
	seedSecurityBalance,
	seedTrade,
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
	await expect(page.getByText('No positions yet')).toBeVisible();

	await goToAddPage(page, 'Securities');
	await expect(page).toHaveURL('/securities/add');

	await page.getByLabel('Name').fill('Vanguard Total Stock Market ETF');
	await page.getByLabel('Symbol').fill('VTI');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Security added')).toBeVisible();
	await expect(page).toHaveURL('/securities');
	const securityRow = page.getByRole('row', { name: /Vanguard Total Stock Market ETF/ });
	await expect(securityRow).toContainText('VTI');

	await securityRow.getByRole('link', { name: 'Vanguard Total Stock Market ETF' }).click();
	await goToEditTab(page);
	await expect(page).toHaveURL(/\/securities\/[^/]+\/edit$/);

	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Core Brokerage' }).click();
	await page.getByLabel('As of').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Quantity').fill('10');
	await page.getByLabel('Price').fill('200');
	await page.getByLabel('Market value', { exact: true }).fill('2000');
	await page.getByLabel('Cost basis').fill('1500');
	await page.getByRole('button', { name: 'Add balance' }).click();
	await expect(page.getByText('Balance updated')).toBeVisible();

	await goToPageViaSidebar(page, 'Portfolio');
	const portfolioRow = page.getByRole('row', { name: /Vanguard Total Stock Market ETF/ });
	await expect(portfolioRow).toBeVisible();
	await expect(portfolioRow).toContainText('VTI');
	await expect(portfolioRow).toContainText('Core Brokerage');
	await expect(portfolioRow).toContainText('10');
	await expect(portfolioRow).toContainText('$2,000.00');
	await expect(portfolioRow).toContainText('$1,500.00');
	await expect(portfolioRow).toContainText('$500.00');

	await portfolioRow.getByRole('link', { name: 'Vanguard Total Stock Market ETF' }).click();
	await expect(page).toHaveURL(/\/securities\//);
	const securityUrl = page.url();
	const securityId = securityUrl.split('/securities/')[1].split('?')[0];
	const firstAccountRow = page.getByRole('row', { name: /Core Brokerage/ });
	await expect(firstAccountRow).toContainText('10');
	await expect(firstAccountRow).toContainText('$200.00');
	await expect(firstAccountRow).toContainText('$2,000.00');

	await goToEditTab(page);
	await expect(page).toHaveURL(`/securities/${securityId}/edit`);
	await page.getByLabel('Account').click();
	await page.getByRole('option', { name: 'Roth Portfolio' }).click();
	await page.getByLabel('As of').fill(formatDateForInput(new UTCDate()));
	await page.getByLabel('Quantity').fill('5');
	await page.getByLabel('Price').fill('210');
	await page.getByLabel('Market value', { exact: true }).fill('1050');
	await page.getByLabel('Cost basis').fill('900');
	await page.getByRole('button', { name: 'Add balance' }).click();
	await expect(page.getByText('Balance updated')).toBeVisible();

	await page.getByRole('link', { name: 'Overview', exact: true }).click();
	await expect(page.getByRole('row', { name: /Roth Portfolio/ })).toContainText('$1,050.00');
	await expect(page.getByRole('region', { name: 'Net market value' })).toContainText('$3,050.00');

	await firstAccountRow.getByRole('link', { name: 'Core Brokerage' }).click();
	await expect(page.getByRole('row', { name: /Vanguard Total Stock Market ETF/ })).toContainText(
		'$2,000.00'
	);
	await expect(page.getByRole('region', { name: 'Net market value' })).toContainText('$2,000.00');

	await goToEditTab(page);
	await expect(page).toHaveURL(`/accounts/${brokerageAccount.id}/edit`);
	await expect(page.getByLabel('Cash', { exact: true })).toHaveValue('$1,000.00');

	await page.getByRole('link', { name: 'Overview', exact: true }).click();
	// No trades exist yet so the overview renders no "View all" link; the test's
	// explicit purpose here is the ledger's account-filter URL-param initialization
	await page.goto(`/trades?account=${brokerageAccount.id}`);
	await expect(page).toHaveURL(`/trades?account=${brokerageAccount.id}`);
	await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText(
		'Core Brokerage'
	);

	await goToRecordDetail(page, 'Securities', 'Vanguard Total Stock Market ETF');
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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
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

test('portfolio account filter updates and restores the URL, rows, and summary cards', async ({
	page
}) => {
	const user = await seedUser('cassia');
	const alphaAccount = await seedAccount({
		name: 'Alpha Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const betaAccount = await seedAccount({
		name: 'Beta Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alphaSecurity = await seedSecurity({ name: 'Alpha Fund', symbol: 'ALFA', owner: user.id });
	const betaSecurity = await seedSecurity({ name: 'Beta Fund', symbol: 'BETA', owner: user.id });
	await seedSecurityBalance({
		account: alphaAccount.id,
		owner: user.id,
		security: alphaSecurity.id,
		asOf: new Date().toISOString(),
		quantity: 10,
		price: 100,
		value: 1000,
		costBasis: 800
	});
	await seedSecurityBalance({
		account: betaAccount.id,
		owner: user.id,
		security: betaSecurity.id,
		asOf: new Date().toISOString(),
		quantity: 20,
		price: 150,
		value: 3000,
		costBasis: 2000
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	await expect(page.getByRole('row', { name: /Alpha Fund/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /Beta Fund/ })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Net market value' })).toContainText('$4,000.00');

	const accountPicker = page.getByRole('button', { name: 'Account', exact: true });
	await accountPicker.click();
	await page.getByRole('option', { name: 'Alpha Brokerage' }).click();
	await expect(page).toHaveURL(`/portfolio?account=${alphaAccount.id}`);
	await expect(page.getByRole('row', { name: /Alpha Fund/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /Beta Fund/ })).not.toBeVisible();
	await expect(page.getByRole('region', { name: 'Net gain/loss' })).toContainText('$200.00');
	await expect(page.getByRole('region', { name: 'Net gain %' })).toContainText('+25.0%');
	await expect(page.getByRole('region', { name: 'Net market value' })).toContainText('$1,000.00');

	await page.reload();
	await expect(page).toHaveURL(`/portfolio?account=${alphaAccount.id}`);
	await expect(accountPicker).toContainText('Alpha Brokerage');
	await expect(page.getByRole('row', { name: /Alpha Fund/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /Beta Fund/ })).not.toBeVisible();
	await expect(page.getByRole('region', { name: 'Net market value' })).toContainText('$1,000.00');
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
	const worthlessSecurity = await seedSecurity({
		name: 'Worthless Fund',
		symbol: 'WRTH',
		owner: user.id
	});
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: worthlessSecurity.id,
		asOf: new Date().toISOString(),
		quantity: 4,
		price: 0,
		value: 0,
		costBasis: 0
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	const row = page.getByRole('row', { name: /Private Fund/ });
	await expect(row).toContainText('PFND');
	await expect(row.locator('td').last()).toHaveText('~');

	const knownZeroRow = page.getByRole('row', { name: /Worthless Fund/ });
	await expect(knownZeroRow).toContainText('WRTH');
	await expect(knownZeroRow.locator('td').last()).toHaveText('$0.00');

	const partialTotalLabel =
		'Some items are missing values or conversion rates and are excluded from this total';
	const portfolioMarketValue = page.getByRole('region', { name: 'Net market value' });
	await expect(portfolioMarketValue).toContainText('~ $0.00');
	await expect(portfolioMarketValue.getByLabel(partialTotalLabel)).toBeVisible();

	await row.getByRole('link', { name: 'Unknown Value Brokerage' }).click();
	const accountMarketValue = page.getByRole('region', { name: 'Net market value' });
	await expect(accountMarketValue).toContainText('~ $0.00');
	await expect(accountMarketValue.getByLabel(partialTotalLabel)).toBeVisible();
	const positionRow = page.getByRole('table').getByRole('row', { name: /Private Fund/ });
	// Gain/loss % cell (index 6) and Value cell (last) both stay unknown — never coerced to 0.
	await expect(positionRow.locator('td').nth(6)).toHaveText('~');
	await expect(positionRow.locator('td').last()).toHaveText('~');

	await goToEditTab(page);
	await expect(page.getByLabel('Cash', { exact: true })).toHaveValue('$750.00');

	await page.getByRole('link', { name: 'Overview', exact: true }).click();
	await positionRow.getByRole('link', { name: 'Private Fund' }).click();
	await expect(page.getByRole('region', { name: 'Net market value' })).toHaveText(/~/);

	await goToPageViaSidebar(page, 'Accounts');
	const accountRow = page.getByRole('row', { name: /Unknown Value Brokerage/ });
	await expect(accountRow.locator('td').last()).toHaveText('~');
	await expect(page.getByRole('region', { name: 'Net balance' })).toHaveText(/~/);

	await goToPageViaSidebar(page, 'Big picture');
	await expect(page.getByRole('region', { name: 'Net worth' })).toHaveText(/~/);
	await expect(page.getByRole('region', { name: 'Investments' })).toHaveText(/~/);
});

test('portfolio tables sort positions by market value descending with unknown values last', async ({
	page
}) => {
	const user = await seedUser('silas');
	const mainAccount = await seedAccount({
		name: 'Main Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const secondAccount = await seedAccount({
		name: 'Second Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const thirdAccount = await seedAccount({
		name: 'Third Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const alpha = await seedSecurity({ name: 'Alpha Holdings', symbol: 'ALP', owner: user.id });
	const bravo = await seedSecurity({ name: 'Bravo Holdings', symbol: 'BRV', owner: user.id });
	const charlie = await seedSecurity({ name: 'Charlie Holdings', symbol: 'CHR', owner: user.id });
	const delta = await seedSecurity({ name: 'Delta Holdings', symbol: 'DLT', owner: user.id });
	const asOf = new Date().toISOString();
	// Seed values so the value-descending order contradicts the alphabetical order on every
	// table, so the assertions can only pass under value-desc with nulls last:
	// - Portfolio aggregate: Alpha 4500, Charlie 4000, Bravo 3500, Delta unknown — Charlie
	//   (later name) outranks Bravo, and the unknown Delta sorts last.
	// - Main account positions: Bravo 3500 outranks Alpha 1500 (later name, higher value).
	// - Alpha security detail: Third 3000 outranks Main 1500 (later account name, higher value).
	// - Delta security detail: Third 100 known, Second unknown — the unknown account sorts last.
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 5,
		price: 300,
		value: 1500,
		costBasis: 1200
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: alpha.id,
		asOf,
		quantity: 10,
		price: 300,
		value: 3000,
		costBasis: 2500
	});
	await seedSecurityBalance({
		account: mainAccount.id,
		owner: user.id,
		security: bravo.id,
		asOf,
		quantity: 14,
		price: 250,
		value: 3500,
		costBasis: 3000
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: charlie.id,
		asOf,
		quantity: 16,
		price: 250,
		value: 4000,
		costBasis: 3400
	});
	await seedSecurityBalance({
		account: secondAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 6,
		price: null,
		value: null,
		costBasis: 600
	});
	await seedSecurityBalance({
		account: thirdAccount.id,
		owner: user.id,
		security: delta.id,
		asOf,
		quantity: 2,
		price: 50,
		value: 100,
		costBasis: 80
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	const portfolioRows = page.getByRole('row');
	await expect(portfolioRows.nth(1)).toContainText('Alpha Holdings');
	await expect(portfolioRows.nth(2)).toContainText('Charlie Holdings');
	await expect(portfolioRows.nth(3)).toContainText('Bravo Holdings');
	await expect(portfolioRows.nth(4)).toContainText('Delta Holdings');
	await expect(portfolioRows.nth(4).locator('td').last()).toHaveText('~');

	await portfolioRows.nth(1).getByRole('link', { name: 'Main Brokerage' }).click();
	const accountPositionRows = page.getByRole('table').getByRole('row');
	await expect(accountPositionRows.nth(1)).toContainText('Bravo Holdings');
	await expect(accountPositionRows.nth(2)).toContainText('Alpha Holdings');

	await accountPositionRows.nth(2).getByRole('link', { name: 'Alpha Holdings' }).click();
	const alphaBalanceRows = page.getByRole('table').getByRole('row');
	await expect(alphaBalanceRows.nth(1)).toContainText('Third Brokerage');
	await expect(alphaBalanceRows.nth(2)).toContainText('Main Brokerage');

	await goToRecordDetail(page, 'Securities', 'Delta Holdings');
	const deltaBalanceRows = page.getByRole('table').getByRole('row');
	await expect(deltaBalanceRows.nth(1)).toContainText('Third Brokerage');
	await expect(deltaBalanceRows.nth(2)).toContainText('Second Brokerage');
	await expect(deltaBalanceRows.nth(2).locator('td').last()).toHaveText('~');
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
	await seedTrade({
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

	await goToPageViaSidebar(page, 'Securities');
	await expect(page.getByRole('row', { name: /Round Trip Stock/ })).toBeVisible();

	await goToPageViaSidebar(page, 'Trades');
	await page.getByRole('button', { name: 'Period' }).click();
	await page.getByRole('button', { name: 'Lifetime' }).click();
	await expect(page.getByRole('row', { name: /Exit Round Trip Stock/ })).toBeVisible();
});

test('portfolio carries a re-buy after a sell-out forward as unknown', async ({ page }) => {
	const user = await seedUser('wren');
	const account = await seedAccount({
		name: 'Rebuy Brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		owner: user.id,
		balanceType: 'Brokerage'
	});
	const security = await seedSecurity({ name: 'Rebought Stock', symbol: 'RBT', owner: user.id });
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: '2026-01-01 00:00:00.000Z',
		quantity: 5,
		price: 10,
		value: 50,
		costBasis: 50
	});
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: '2026-02-01 00:00:00.000Z',
		quantity: 0,
		price: null,
		value: 0,
		costBasis: 0
	});
	await seedSecurityBalance({
		account: account.id,
		owner: user.id,
		security: security.id,
		asOf: '2026-03-01 00:00:00.000Z',
		quantity: 7,
		price: null,
		value: null,
		costBasis: null
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Portfolio');
	const row = page.getByRole('row', { name: /Rebought Stock/ });
	await expect(row).toContainText('RBT');
	await expect(row.locator('td').last()).toHaveText('~');

	await row.getByRole('link', { name: 'Rebought Stock' }).click();
	await expect(page.getByRole('region', { name: 'Net market value' })).toHaveText(/~/);
});

test('transactions and portfolio add forms show empty prerequisites with no accounts', async ({
	page
}) => {
	const user = await seedUser('opal');

	await page.goto('/');
	await signIn(page, user.email);
	await goToAddPage(page, 'Transactions');
	await page.getByLabel('Account').click();
	const transactionAccountPicker = page.getByRole('listbox');
	await expect(
		transactionAccountPicker.getByRole('option', { name: 'There are no accounts' })
	).toBeVisible();
	await expect(transactionAccountPicker.getByRole('link', { name: 'Add account' })).toHaveCount(0);

	await goToAddPage(page, 'Trades');
	await page.getByLabel('Account').click();
	const tradeAccountPicker = page.getByRole('listbox');
	await expect(
		tradeAccountPicker.getByRole('option', { name: 'There are no accounts' })
	).toBeVisible();
	await expect(tradeAccountPicker.getByRole('link', { name: 'Add account' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await page.getByLabel('Security').click();
	await expect(page.getByRole('option', { name: 'Create new security' })).toBeVisible();

	await goToAddPage(page, 'Securities');
	await page.getByLabel('Name').fill('Opal Fund');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page).toHaveURL('/securities');

	await page.getByRole('link', { name: 'Opal Fund' }).click();
	await goToEditTab(page);
	await expect(page).toHaveURL(/\/securities\/[^/]+\/edit$/);

	await page.getByLabel('Account').click();
	const balanceAccountPicker = page.getByRole('listbox');
	await expect(
		balanceAccountPicker.getByRole('option', { name: 'There are no accounts' })
	).toBeVisible();
	await expect(balanceAccountPicker.getByRole('link', { name: 'Add account' })).toHaveCount(0);
});

test('trades and securities empty prerequisites stay consistent', async ({ page }) => {
	const user = await seedUser('noemi');
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

	await goToAddPage(page, 'Trades');
	await page.getByLabel('Security').click();
	await expect(page.getByRole('option', { name: 'Create new security' })).toBeVisible();

	await goToPageViaSidebar(page, 'Securities');
	await expect(page.getByText('No securities yet')).toBeVisible();
	await goToAddPage(page, 'Securities');
	await page.getByLabel('Name').fill('Empty Flow Fund');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('row', { name: /Empty Flow Fund/ })).toBeVisible();

	await goToAddPage(page, 'Trades');
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
