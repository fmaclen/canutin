import { expect, Locator, Page } from '@playwright/test';
import { addDays, setHours, startOfMonth, subMonths } from 'date-fns';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

export async function getRowIndex(rows: Locator, name: string) {
	return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
}

export function formatDateForInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

export function isoMidOfMonthMonthsAgo(monthsAgo: number) {
	// NOTE: 15th at local noon for stable month inclusion across timezones/DST
	const targetMonthStart = subMonths(startOfMonth(new Date()), monthsAgo);
	return setHours(addDays(targetMonthStart, 14), 12).toISOString();
}

export async function signIn(page: Page, email: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
}

// Label → route map used by goToPageViaSidebar. Keep in sync with app-sidebar.svelte,
// nav-user.svelte, and settings/+layout.svelte (Imports lives in the settings SubNav).
const SIDEBAR_ROUTES: Record<string, string> = {
	Accounts: '/accounts',
	Currencies: '/currencies',
	Assets: '/assets',
	Portfolio: '/portfolio',
	Securities: '/securities',
	Trades: '/trades',
	Transactions: '/transactions',
	'Balance sheet': '/balance-sheet',
	'Big picture': '/big-picture',
	Trends: '/trends',
	Imports: '/settings/imports',
	Settings: '/settings'
};

export async function goToPageViaSidebar(page: Page, label: string) {
	// Navigates directly instead of clicking the sidebar link. The mobile sidebar
	// is a Sheet that animates in — clicking a link mid-animation detaches the
	// element and flakes on CI. Tests here use this as a nav primitive, not to
	// verify the sidebar UI itself.
	const route = SIDEBAR_ROUTES[label];
	if (!route) {
		throw new Error(`No route mapped for sidebar label: ${label}`);
	}
	await page.goto(route);
}

// Sidebar label → header add-link text. The Accounts/Assets/etc. index pages each
// render a single "Add …" action link in their page header. Keep in sync with the
// `{#snippet actions()}` blocks in the corresponding index +page.svelte files.
const ADD_LINK_LABELS: Record<string, string> = {
	Transactions: 'Add transaction',
	Trades: 'Add trade',
	Securities: 'Add security',
	Currencies: 'Add currency'
};

export async function goToRecordDetail(page: Page, sidebarLabel: string, recordName: string) {
	await goToPageViaSidebar(page, sidebarLabel);
	const allTab = page.getByRole('tab', { name: 'All' });
	const recordLink = page.getByRole('link', { name: recordName });
	// Accounts and Assets default to a filtered subset (open / owned), so a seeded
	// record can start hidden behind a tab. Wait until the index has loaded — either
	// the record link is already showing, or the filter tabs have rendered — then
	// switch to "All" when tabs exist so the row is present before clicking it.
	// Indexes without filter tabs skip the reveal entirely.
	await expect(allTab.or(recordLink).first()).toBeVisible();
	if (await allTab.isVisible()) {
		await allTab.click();
	}
	await recordLink.click();
}

export async function goToEditTab(page: Page) {
	// Detail pages expose Overview/Edit as a SubNav of links; exact match keeps this
	// from catching the batch editor's "Edit N transactions" link on index pages.
	await page.getByRole('link', { name: 'Edit', exact: true }).click();
}

export async function goToAddPage(page: Page, sidebarLabel: string) {
	await goToPageViaSidebar(page, sidebarLabel);
	const label = ADD_LINK_LABELS[sidebarLabel];
	if (!label) {
		throw new Error(`No add-link label mapped for sidebar label: ${sidebarLabel}`);
	}
	await page.getByRole('link', { name: label, exact: true }).click();
}
