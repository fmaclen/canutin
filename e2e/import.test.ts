import { expect, test } from '@playwright/test';

import { IMPORT_PATH, importPayload } from './import.helpers';
import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { getUserPB, pbSend, seedUser } from './pocketbase.helpers';

test('imports page shows empty state when no imports exist', async ({ page }) => {
	const user = await seedUser('wendy');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Imports');

	await expect(page.getByText('No imports yet')).toBeVisible();
});

test('bulk import creates records and displays on the imports page', async ({ page }) => {
	const user = await seedUser('nathan');

	const response = await pbSend(
		IMPORT_PATH,
		importPayload('nathan-scraper-2025-06-15'),
		user.email
	);
	const result = await response.json();

	expect(response.status).toBe(200);
	expect(result.accounts.created).toBe(2);
	expect(result.accounts.existing).toBe(0);
	expect(result.transactions.created).toBe(3);
	expect(result.transactions.skipped).toBe(0);
	expect(result.accountBalances.created).toBe(2);
	expect(result.accountBalances.skipped).toBe(0);
	expect(result.assets.created).toBe(1);
	expect(result.assets.existing).toBe(0);
	expect(result.assetBalances.created).toBe(1);
	expect(result.assetBalances.skipped).toBe(0);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Imports');

	await expect(page.getByText('nathan-scraper-2025-06-15')).toBeVisible();
	await expect(page.getByText('Completed')).toBeVisible();
});

test('duplicate import skips existing records', async ({ page }) => {
	const user = await seedUser('olivia');
	const payload = importPayload('olivia-scraper-run-1');

	const firstResult = await (await pbSend(IMPORT_PATH, payload, user.email)).json();

	expect(firstResult.accounts.created).toBe(2);
	expect(firstResult.transactions.created).toBe(3);
	expect(firstResult.accountBalances.created).toBe(2);
	expect(firstResult.assets.created).toBe(1);
	expect(firstResult.assetBalances.created).toBe(1);

	payload.sessionLabel = 'olivia-scraper-run-2';
	const secondResult = await (await pbSend(IMPORT_PATH, payload, user.email)).json();

	expect(secondResult.accounts.created).toBe(0);
	expect(secondResult.accounts.existing).toBe(2);
	expect(secondResult.transactions.created).toBe(0);
	expect(secondResult.transactions.skipped).toBe(3);
	expect(secondResult.accountBalances.created).toBe(0);
	expect(secondResult.accountBalances.skipped).toBe(2);
	expect(secondResult.assets.created).toBe(0);
	expect(secondResult.assets.existing).toBe(1);
	expect(secondResult.assetBalances.created).toBe(0);
	expect(secondResult.assetBalances.skipped).toBe(1);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Imports');

	await expect(page.getByText('olivia-scraper-run-1')).toBeVisible();
	await expect(page.getByText('olivia-scraper-run-2')).toBeVisible();
});

test('reverting an import deletes its records and updates status', async ({ page }) => {
	const user = await seedUser('samuel');

	const result = await (
		await pbSend(IMPORT_PATH, importPayload('samuel-scraper-to-revert'), user.email)
	).json();

	expect(result.transactions.created).toBe(3);
	expect(result.accounts.created).toBe(2);

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Imports');

	await expect(page.getByText('samuel-scraper-to-revert')).toBeVisible();
	await expect(page.getByText('Completed')).toBeVisible();

	await page.getByRole('button', { name: 'Revert' }).click();
	await expect(page.getByText('This will permanently delete all records')).toBeVisible();

	await page.getByRole('alertdialog').getByRole('button', { name: 'Revert' }).click();
	await expect(page.getByText('Import reverted')).toBeVisible();

	await expect(page.getByText('Rolled back')).toBeVisible();

	const pb = await getUserPB(user.email);
	const transactions = await pb.collection('transactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(transactions.length).toBe(0);

	const accounts = await pb.collection('accounts').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(accounts.length).toBe(0);
});

test('imports page shows the completed-with-errors status and failed count', async ({ page }) => {
	const user = await seedUser('rosa');
	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'rosa-partial-import',
				accounts: [{ name: 'Rosa Checking', balanceGroup: 'CASH', balanceType: 'Checking' }],
				transactions: [
					{
						accountName: 'Rosa Checking',
						date: '2025-06-10T00:00:00.000Z',
						description: 'Valid deposit',
						value: 100
					},
					{
						accountName: 'Ghost Account',
						date: '2025-06-11T00:00:00.000Z',
						description: 'Unresolvable account',
						value: -50
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed_with_errors');

	await page.goto('/');
	await signIn(page, user.email);
	await goToPageViaSidebar(page, 'Imports');

	await expect(page.getByText('rosa-partial-import')).toBeVisible();
	await expect(page.getByText('Completed with errors')).toBeVisible();

	const row = page.getByRole('row').filter({ hasText: 'rosa-partial-import' });
	const failedCell = row.getByRole('cell').nth(4);
	await expect(failedCell).toHaveText('1');
});
