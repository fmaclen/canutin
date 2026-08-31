import { expect, test } from '@playwright/test';

import { IMPORT_PATH, securitiesPayload } from './import.helpers';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { getUserPB, pbSend, seedUser } from './pocketbase.helpers';

const REVERT_PATH = '/api/canutin/import/revert';

test('reverting an import deletes securities, balances, and transactions', async ({ page }) => {
	const user = await seedUser('frank');

	const result = await (
		await pbSend(IMPORT_PATH, securitiesPayload('frank-securities-to-revert'), user.email)
	).json();

	expect(result.securities.created).toBe(3);
	expect(result.securityBalances.created).toBe(1);
	expect(result.securityTransactions.created).toBe(1);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Settings');
	await page.getByRole('link', { name: 'Imports' }).click();

	await expect(page.getByText('frank-securities-to-revert')).toBeVisible();
	await expect(page.getByText('Completed')).toBeVisible();

	await pbSend(REVERT_PATH, { sessionId: result.sessionId }, user.email);

	const pb = await getUserPB(user.email);
	const securities = await pb.collection('securities').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(securities.length).toBe(0);

	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balances.length).toBe(0);

	const trades = await pb.collection('securityTransactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(trades.length).toBe(0);

	const session = await pb.collection('importSessions').getOne(result.sessionId);
	expect(session.status).toBe('rolled_back');
});
