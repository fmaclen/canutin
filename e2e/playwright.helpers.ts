import { expect, Locator, Page } from '@playwright/test';

import { DEFAULT_PASSWORD } from './pocketbase.helpers';

export async function getRowIndex(rows: Locator, name: string) {
	return rows.evaluateAll((els, n) => els.findIndex((el) => el.textContent?.includes(n)), name);
}

export function formatDateForInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

export async function signIn(page: Page, email: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Login' }).click();
	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
}

export async function signOut(page: Page, userLabel: string) {
	const userButton = page.getByRole('button', { name: userLabel });
	if (!(await userButton.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(userButton).toBeVisible();
	}
	await userButton.click();
	await page.getByRole('menuitem', { name: 'Log out' }).click();
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
}

// Label → route map used by goToPageViaSidebar. Keep in sync with app-sidebar.svelte.
const SIDEBAR_ROUTES: Record<string, string> = {
	Accounts: '/accounts',
	Assets: '/assets',
	Portfolio: '/portfolio',
	Securities: '/securities',
	Trades: '/trades',
	Transactions: '/transactions',
	'Balance sheet': '/balance-sheet',
	'Big picture': '/big-picture',
	Trends: '/trends',
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
