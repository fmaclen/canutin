import { expect, test, type Locator, type Page } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import {
	goToAddPage,
	goToEditTab,
	goToPageViaSidebar,
	goToRecordDetail,
	signIn
} from './playwright.helpers';
import {
	getUserPB,
	seedAccount,
	seedCurrency,
	seedExchangeRate,
	seedUser
} from './pocketbase.helpers';

function uniqueCurrency(prefix: string) {
	return `${prefix}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function utcIso(date: string) {
	return `${date}T00:00:00.000Z`;
}

function formatLedgerDate(date: string) {
	return new Date(utcIso(date)).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

function formatRate(value: number, currency: string) {
	if (currency === 'ARS') {
		return value.toLocaleString('es-AR', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}
	return `${value.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})} ${currency}`;
}

function currencyRow(page: Page, code: string) {
	return page.getByRole('row', { name: new RegExp(`\\b${code}\\b`) });
}

async function expectCurrencyDetailFrom(page: Page, id: string, from: string) {
	await expect(page).toHaveURL(new RegExp(`/currencies/${id}\\?from=`));
	const currentUrl = new URL(page.url());
	expect(currentUrl.pathname).toBe(`/currencies/${id}`);
	expect(currentUrl.searchParams.get('from')).toBe(from);
}

async function expectCellText(row: Locator, index: number, text: string | RegExp) {
	await expect(row.locator('td').nth(index)).toHaveText(text);
}

test('the currencies ledger shows the USD pivot and seeded registry currencies', async ({
	page
}) => {
	const user = await seedUser('cornelia');
	const manualCode = 'ARS';
	const automaticCode = uniqueCurrency('QA');
	const manualDate = '2026-04-10';
	const automaticDate = '2026-04-11';

	await seedCurrency({
		owner: user.id,
		code: manualCode,
		name: 'Manual peso',
		autoUpdate: false
	});
	await seedExchangeRate({
		owner: user.id,
		currency: manualCode,
		date: utcIso(manualDate),
		rate: 1495
	});
	await seedCurrency({
		owner: user.id,
		code: automaticCode,
		name: 'Automatic crown',
		autoUpdate: true
	});
	await seedExchangeRate({
		owner: user.id,
		currency: automaticCode,
		date: utcIso(automaticDate),
		rate: 2.3456
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Currencies');

	await expect(page.getByRole('link', { name: 'Add currency' })).toBeVisible();
	await expect(page.getByText('Code', { exact: true })).toBeVisible();
	await expect(page.getByText('Name', { exact: true })).toBeVisible();
	await expect(page.getByText('Auto-update', { exact: true })).toBeVisible();
	await expect(page.getByText('Last updated', { exact: true })).toBeVisible();
	await expect(page.getByText('Latest quote', { exact: true })).toBeVisible();

	const usdRow = currencyRow(page, 'USD');
	await expect(usdRow).toBeVisible();
	await expectCellText(usdRow, 1, 'US Dollar');
	await expectCellText(usdRow, 2, '~');
	await expectCellText(usdRow, 3, '~');
	await expectCellText(usdRow, 4, '$1.00');

	const manualRow = currencyRow(page, manualCode);
	await expect(manualRow).toBeVisible();
	await expect(manualRow.getByText('Manual peso')).toBeVisible();
	await expectCellText(manualRow, 2, 'Manual');
	await expectCellText(manualRow, 3, formatLedgerDate(manualDate));
	await expectCellText(manualRow, 4, formatRate(1495, manualCode));

	const automaticRow = currencyRow(page, automaticCode);
	await expect(automaticRow).toBeVisible();
	await expect(automaticRow.getByText('Automatic crown')).toBeVisible();
	await expectCellText(automaticRow, 2, 'Automatic');
	await expectCellText(automaticRow, 3, formatLedgerDate(automaticDate));
	await expectCellText(automaticRow, 4, formatRate(2.3456, automaticCode));
});

test('adding a currency previews ISO and custom codes and lists the seeded quote', async ({
	page
}) => {
	const user = await seedUser('lorenzo');
	const now = new Date();
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
		.toISOString()
		.slice(0, 10);

	await page.goto('/');
	await signIn(page, user.email);
	await goToAddPage(page, 'Currencies');

	const code = page.getByLabel('Code', { exact: true });
	const name = page.getByLabel('Name', { exact: true });
	const preview = page.getByLabel('Preview', { exact: true });
	const rate = page.getByLabel('USD exchange rate', { exact: true });

	await expect(code).toHaveAttribute('placeholder', 'EUR');
	await expect(name).toHaveAttribute('placeholder', 'Euro');
	await expect(preview).toBeDisabled();
	await expect(preview).toHaveValue('$12,345.67');
	await expect(page.getByLabel('Automatic updates', { exact: true })).not.toBeChecked();
	await expect(rate).toHaveAttribute('placeholder', '$0.00');
	await expect(page.getByLabel('Date', { exact: true })).toHaveCount(0);

	await code.fill('eur');
	await expect(code).toHaveValue('EUR');
	await expect(preview).toHaveValue('12.345,67\u00a0€');

	await code.fill('euro');
	await expect(code).toHaveValue('EURO');
	await expect(preview).toHaveValue('12,345.67 EURO');
	await expect(page.getByText(/did you mean/i)).toHaveCount(0);

	await name.fill('Euro-like credits');
	await rate.fill('1495');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page).toHaveURL('/currencies');

	const row = currencyRow(page, 'EURO');
	await expect(row).toBeVisible();
	await expect(row.getByText('Euro-like credits')).toBeVisible();
	await expectCellText(row, 2, 'Manual');
	await expectCellText(row, 3, formatLedgerDate(today));
	await expectCellText(row, 4, formatRate(1495, 'EURO'));
});

test('adding a duplicate currency shows the duplicate-code toast', async ({ page }) => {
	const user = await seedUser('priya');
	const code = uniqueCurrency('QD');
	await seedCurrency({ owner: user.id, code, name: 'Duplicate coin', autoUpdate: false });

	await page.goto('/');
	await signIn(page, user.email);
	await goToAddPage(page, 'Currencies');

	await page.getByLabel('Code', { exact: true }).fill(code);
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Currency already exists')).toBeVisible();
	await expect(page).toHaveURL('/currencies/add');
});

test('currency detail edits registry fields and upserts same-date manual quotes', async ({
	page
}) => {
	const user = await seedUser('marguerite');
	const code = uniqueCurrency('QE');
	const quoteDate = '2026-05-02';
	const currency = await seedCurrency({
		owner: user.id,
		code,
		name: 'Original detail coin',
		autoUpdate: false
	});

	await page.goto('/');
	await signIn(page, user.email);
	// This test asserts the bare edit URL below with no `?from=` query param; every click-through
	// path to a currency row attaches one (see the ledger-redirect test), so that exact assertion
	// is only reachable by navigating here directly.
	await page.goto(`/currencies/${currency.id}`);

	await expect(page.getByRole('heading', { name: 'Quote history' })).toBeVisible();
	await expect(page.getByText('No quotes')).toBeVisible();

	await goToEditTab(page);
	await expect(page).toHaveURL(`/currencies/${currency.id}/edit`);

	await expect(page.getByRole('heading', { name: 'Exchange rates' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
	await expect(page.getByLabel('Code', { exact: true })).toBeDisabled();
	await expect(page.getByLabel('Code', { exact: true })).toHaveValue(code);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Original detail coin');
	await expect(page.getByLabel('Automatic updates', { exact: true })).not.toBeChecked();

	await page.getByLabel('Name', { exact: true }).fill('Updated detail coin');
	await page.getByLabel('Automatic updates', { exact: true }).check();
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Currency updated')).toBeVisible();
	await expect(page).toHaveURL(`/currencies/${currency.id}/edit`);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Updated detail coin');
	await expect(page.getByLabel('Automatic updates', { exact: true })).toBeChecked();

	const quotedDate = formatLedgerDate(quoteDate);
	const quoteRow = page.getByRole('row', { name: quotedDate });
	await page.getByLabel('Date', { exact: true }).fill(quoteDate);
	await page.getByLabel('USD exchange rate', { exact: true }).fill('1.23');
	await page.getByRole('button', { name: 'Add quote' }).click();
	await expect(page.getByText('Quote added')).toBeVisible();
	await expect(page).toHaveURL(`/currencies/${currency.id}/edit`);

	await page.getByRole('link', { name: 'Overview' }).click();
	await expect(page).toHaveURL(`/currencies/${currency.id}`);
	await expect(quoteRow.getByText('Manual')).toBeVisible();
	await expect(quoteRow.getByText(formatRate(1.23, code), { exact: true })).toBeVisible();

	await goToEditTab(page);
	await expect(page).toHaveURL(`/currencies/${currency.id}/edit`);
	await page.getByLabel('Date', { exact: true }).fill(quoteDate);
	await page.getByLabel('USD exchange rate', { exact: true }).fill('1.5');
	await page.getByRole('button', { name: 'Add quote' }).click();

	await expect(page.getByText('Quote updated')).toBeVisible();
	await expect(page).toHaveURL(`/currencies/${currency.id}/edit`);

	await page.getByRole('link', { name: 'Overview' }).click();
	await expect(page).toHaveURL(`/currencies/${currency.id}`);
	await expect(quoteRow.getByText(formatRate(1.5, code), { exact: true })).toBeVisible();
	await expect(quoteRow.getByText(formatRate(1.23, code), { exact: true })).not.toBeVisible();

	await goToRecordDetail(page, 'Currencies', 'USD');

	await expect(page.getByText('Base currency', { exact: true })).toBeVisible();
	await expect(
		page.getByText(
			'US dollars are the base currency; exchange rates for other currencies are expressed in USD'
		)
	).toBeVisible();
	await expect(page.getByLabel('Code', { exact: true })).toBeDisabled();
	await expect(page.getByLabel('Code', { exact: true })).toHaveValue('USD');
	await expect(page.getByText('Exchange rates', { exact: true })).toHaveCount(0);
	await expect(page.getByLabel('Automatic updates', { exact: true })).toHaveCount(0);
	await expect(page.getByLabel('Date', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add quote' })).toHaveCount(0);
	await expect(page.getByText('Quote history', { exact: true })).toHaveCount(0);
});

test('currency detail actions reached from the ledger redirect back with the ledger query', async ({
	page
}) => {
	const user = await seedUser('selene');
	const code = uniqueCurrency('QR');
	const quoteDate = '2026-05-09';
	const ledgerUrl = '/currencies?sort=name&dir=desc';
	const currency = await seedCurrency({
		owner: user.id,
		code,
		name: 'Ledger redirect coin',
		autoUpdate: false
	});

	await page.goto('/');
	await signIn(page, user.email);
	// This test's explicit purpose is the ledger's `from=` redirect round-trip, which
	// requires starting from this exact sorted/filtered URL — not reachable by clicking.
	await page.goto(ledgerUrl);

	await currencyRow(page, code).getByRole('link', { name: code }).click();
	await expectCurrencyDetailFrom(page, currency.id, ledgerUrl);

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/currencies/${currency.id}/edit\\?from=`));

	await page.getByLabel('Name', { exact: true }).fill('Ledger redirect coin v2');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page).toHaveURL(ledgerUrl);
	await expect(currencyRow(page, code).getByText('Ledger redirect coin v2')).toBeVisible();

	await currencyRow(page, code).getByRole('link', { name: code }).click();
	await expectCurrencyDetailFrom(page, currency.id, ledgerUrl);

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/currencies/${currency.id}/edit\\?from=`));

	await page.getByLabel('Date', { exact: true }).fill(quoteDate);
	await page.getByLabel('USD exchange rate', { exact: true }).fill('2.25');
	await page.getByRole('button', { name: 'Add quote' }).click();

	await expect(page).toHaveURL(ledgerUrl);
	await expectCellText(currencyRow(page, code), 3, formatLedgerDate(quoteDate));
	await expectCellText(currencyRow(page, code), 4, formatRate(2.25, code));

	await currencyRow(page, code).getByRole('link', { name: code }).click();
	await expectCurrencyDetailFrom(page, currency.id, ledgerUrl);

	await goToEditTab(page);
	await expect(page).toHaveURL(new RegExp(`/currencies/${currency.id}/edit\\?from=`));

	await page.getByLabel('Date', { exact: true }).fill(quoteDate);
	await page.getByLabel('USD exchange rate', { exact: true }).fill('2.5');
	await page.getByRole('button', { name: 'Add quote' }).click();

	await expect(page).toHaveURL(ledgerUrl);
	await expectCellText(currencyRow(page, code), 4, formatRate(2.5, code));
});

test('currency overview shows rate history once it has at least two quotes', async ({ page }) => {
	const user = await seedUser('beatrix');
	const code = uniqueCurrency('QH');
	await seedCurrency({
		owner: user.id,
		code,
		name: 'History coin',
		autoUpdate: false
	});
	await seedExchangeRate({
		owner: user.id,
		currency: code,
		date: utcIso('2026-01-01'),
		rate: 1.1
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Currencies', code);
	await expect(page.getByRole('heading', { name: 'Rate history' })).toBeVisible();
	await expect(page.getByText('No rate history yet')).toBeVisible();

	await seedExchangeRate({
		owner: user.id,
		currency: code,
		date: utcIso('2026-02-01'),
		rate: 1.2
	});
	await expect(page.getByText('No rate history yet')).not.toBeVisible();
	await expect(page.getByRole('img', { name: 'Rate' })).toBeVisible();
});

test('currency delete blocks in-use currencies and removes unused quotes', async ({ page }) => {
	const user = await seedUser('octavia');
	const guardedCode = uniqueCurrency('QG');
	const unusedCode = uniqueCurrency('QU');
	const quoteDate = '2026-06-14';

	const guardedCurrency = await seedCurrency({
		owner: user.id,
		code: guardedCode,
		name: 'Guarded coin',
		autoUpdate: false
	});
	await seedCurrency({
		owner: user.id,
		code: unusedCode,
		name: 'Unused coin',
		autoUpdate: false
	});
	await seedExchangeRate({
		owner: user.id,
		currency: guardedCode,
		date: utcIso(quoteDate),
		rate: 44
	});
	await seedExchangeRate({
		owner: user.id,
		currency: unusedCode,
		date: utcIso(quoteDate),
		rate: 55
	});
	await seedAccount({
		name: 'Guarded account',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		owner: user.id,
		balanceType: 'Checking',
		currency: guardedCode
	});

	await page.goto('/');
	await signIn(page, user.email);
	// This test asserts the bare edit URL below with no `?from=` query param; every click-through
	// path to a currency row attaches one (see the ledger-redirect test), so that exact assertion
	// is only reachable by navigating here directly.
	await page.goto(`/currencies/${guardedCurrency.id}/edit`);

	await page.getByRole('button', { name: 'Delete' }).first().click();
	const guardedDialog = page.getByRole('alertdialog');
	await expect(guardedDialog).toBeVisible();
	await guardedDialog.getByRole('button').last().click();

	await expect(page.getByText('Currency is in use')).toBeVisible();
	await expect(page).toHaveURL(`/currencies/${guardedCurrency.id}/edit`);

	// The blocked delete leaves the confirmation dialog open; dismiss it before navigating on,
	// same as a real user would.
	await guardedDialog.getByRole('button').first().click();
	await expect(guardedDialog).not.toBeVisible();

	await goToRecordDetail(page, 'Currencies', unusedCode);
	await goToEditTab(page);
	await page.getByRole('button', { name: 'Delete' }).first().click();
	const unusedDialog = page.getByRole('alertdialog');
	await expect(unusedDialog).toBeVisible();
	await unusedDialog.getByRole('button').last().click();

	await expect(page).toHaveURL('/currencies');
	await expect(currencyRow(page, unusedCode)).not.toBeVisible();

	const userPB = await getUserPB(user.email);
	const quotes = await userPB.collection('exchangeRates').getFullList({
		filter: `owner='${user.id}' && currency='${unusedCode}'`
	});
	expect(quotes).toHaveLength(0);
});
