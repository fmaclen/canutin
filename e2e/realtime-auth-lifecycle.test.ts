import { expect, Page, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedUser } from './pocketbase.helpers';

function collectRealtimeAuthForbidden(page: Page) {
	const forbidden: string[] = [];
	page.on('response', (response) => {
		const url = response.url();
		const isRealtimeAuth =
			url.includes('/api/realtime') || url.includes('/api/collections/users/auth-refresh');
		if (isRealtimeAuth && response.status() === 403) {
			forbidden.push(`${response.status()} ${url}`);
		}
	});
	return forbidden;
}

async function logOut(page: Page) {
	const logoutButton = page.getByRole('button', { name: 'Log out' });
	if (!(await logoutButton.isVisible())) {
		await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(logoutButton).toBeVisible();
	}
	await logoutButton.click();
}

test('logging out from a realtime route emits no realtime authorization 403', async ({ page }) => {
	const user = await seedUser('quill');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Big picture');
	await expect(page.getByRole('region', { name: 'Income per month' })).toBeVisible();

	const forbidden = collectRealtimeAuthForbidden(page);

	await logOut(page);
	await expect(page).toHaveURL('/auth');
	await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	await expect(page.getByText('Your session has expired')).not.toBeVisible();
	expect(forbidden).toEqual([]);
});

test('navigating between authenticated realtime routes emits no realtime 403', async ({ page }) => {
	const user = await seedUser('roman');

	await page.goto('/');
	await signIn(page, user.email);

	const forbidden = collectRealtimeAuthForbidden(page);

	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();

	await goToPageViaSidebar(page, 'Big picture');
	await expect(page.getByRole('region', { name: 'Income per month' })).toBeVisible();

	await goToPageViaSidebar(page, 'Transactions');
	await expect(page.getByRole('region', { name: 'Transactions summary' })).toBeVisible();

	await goToPageViaSidebar(page, 'Trades');
	await expect(page.getByRole('region', { name: 'Trades summary' })).toBeVisible();

	await goToPageViaSidebar(page, 'Big picture');
	await expect(page.getByRole('region', { name: 'Net worth' })).toBeVisible();
	await expect(page.getByText('Your session has expired')).not.toBeVisible();
	expect(forbidden).toEqual([]);
});
