import { expect, Page, test } from '@playwright/test';

import { signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

// On desktop the sidebar is expanded by default; on mobile it is a Sheet that
// stays closed until "Toggle Sidebar" is clicked, and navigating closes it
// again. Reopen it before each interaction so the test runs on both projects.
// The mobile sheet stays mounted (data-state="closed") for its close transition
// before unmounting, so a plain visibility check would catch it mid-animation -
// check data-state too, since accounts stays visible until the transition ends.
async function ensureSidebarOpen(page: Page) {
	const sidebar = page.getByLabel('Sidebar');
	const accounts = sidebar.getByRole('link', { name: 'Accounts' });
	if (await sidebar.count()) {
		const state = await sidebar.getAttribute('data-state');
		if (state !== 'closed' && (await accounts.isVisible())) return;
	}
	await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
	await expect(accounts).toBeVisible();
}

test('sidebar shows pillars before subordinate records and highlights the active item', async ({
	page,
	isMobile
}) => {
	const user = await seedUser('wallace');

	await page.goto('/');
	await signIn(page, user.email);
	await ensureSidebarOpen(page);

	const sidebar = page.getByLabel('Sidebar');

	await expect(sidebar.getByRole('link', { name: 'The big picture' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Balance sheet' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Portfolio' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Trends' })).toBeVisible();

	const accounts = sidebar.getByRole('link', { name: 'Accounts' });
	const transactions = sidebar.getByRole('link', { name: 'Transactions' });
	const trades = sidebar.getByRole('link', { name: 'Trades' });
	const securities = sidebar.getByRole('link', { name: 'Securities' });
	const assets = sidebar.getByRole('link', { name: 'Assets' });
	await expect(accounts).toBeVisible();
	await expect(transactions).toBeVisible();
	await expect(trades).toBeVisible();
	await expect(securities).toBeVisible();
	await expect(assets).toBeVisible();

	const accountsTop = await accounts.evaluate((el) => el.getBoundingClientRect().top);
	const transactionsTop = await transactions.evaluate((el) => el.getBoundingClientRect().top);
	const tradesTop = await trades.evaluate((el) => el.getBoundingClientRect().top);
	const securitiesTop = await securities.evaluate((el) => el.getBoundingClientRect().top);
	const assetsTop = await assets.evaluate((el) => el.getBoundingClientRect().top);
	expect(accountsTop).toBeLessThan(assetsTop);
	expect(assetsTop).toBeLessThan(transactionsTop);
	expect(transactionsTop).toBeLessThan(tradesTop);
	expect(tradesTop).toBeLessThan(securitiesTop);

	await trades.click();
	await expect(page).toHaveURL(/\/trades$/);
	// Navigating on mobile closes the sheet; desktop leaves it expanded.
	if (isMobile) await expect(sidebar).toBeHidden();
	await ensureSidebarOpen(page);
	await expect(sidebar.getByRole('link', { name: 'Trades' })).toHaveAttribute(
		'data-active',
		'true'
	);
	await expect(sidebar.getByRole('link', { name: 'Accounts' })).toHaveAttribute(
		'data-active',
		'false'
	);
	await expect(sidebar.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
		'data-active',
		'false'
	);

	await sidebar.getByRole('link', { name: 'Securities' }).click();
	await expect(page).toHaveURL(/\/securities$/);
	await ensureSidebarOpen(page);
	await expect(sidebar.getByRole('link', { name: 'Securities' })).toHaveAttribute(
		'data-active',
		'true'
	);
	await expect(sidebar.getByRole('link', { name: 'Trades' })).toHaveAttribute(
		'data-active',
		'false'
	);

	await sidebar.getByRole('link', { name: 'Transactions' }).click();
	await expect(page).toHaveURL(/\/transactions$/);
	await ensureSidebarOpen(page);
	await expect(sidebar.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
		'data-active',
		'true'
	);
	await expect(sidebar.getByRole('link', { name: 'Accounts' })).toHaveAttribute(
		'data-active',
		'false'
	);

	await sidebar.getByRole('link', { name: 'Accounts' }).click();
	await expect(page).toHaveURL(/\/accounts$/);
	await ensureSidebarOpen(page);
	await expect(sidebar.getByRole('link', { name: 'Accounts' })).toHaveAttribute(
		'data-active',
		'true'
	);
});
