import { expect, test } from '@playwright/test';

import { goToAddPage, goToPageViaSidebar, goToRecordDetail, signIn } from './playwright.helpers';
import { seedPortfolio, seedSecurityBalance, seedUser } from './pocketbase.helpers';

test('security creation rejects names that differ only by case and whitespace', async ({
	page
}) => {
	const user = await seedUser('calathea');

	await page.goto('/');
	await signIn(page, user.email);
	await goToAddPage(page, 'Securities');
	await page.getByLabel('Name').fill('Solar Industries');
	await page.getByLabel('Symbol').fill('SOL');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Security added')).toBeVisible();

	await goToAddPage(page, 'Securities');
	await page.getByLabel('Name').fill('solar industries ');
	await page.getByLabel('Symbol').fill('SOL2');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('A security with this name already exists')).toBeVisible();

	await goToPageViaSidebar(page, 'Securities');
	await expect(page.getByRole('link', { name: /solar industries/i })).toHaveCount(1);
});

test('security overview shows price history once it has at least two priced quotes', async ({
	page
}) => {
	const user = await seedUser('thaddeus');
	const {
		accounts: [account],
		securities: [security]
	} = await seedPortfolio(user.id, {
		accounts: ['Thaddeus Brokerage'],
		securities: [{ name: 'Priced Security', symbol: 'PRC' }],
		balances: [
			{
				account: 'Thaddeus Brokerage',
				security: 'Priced Security',
				quantity: 10,
				price: 100,
				value: 1000,
				costBasis: 800
			}
		],
		asOf: '2026-01-01T00:00:00.000Z'
	});

	await page.goto('/');
	await signIn(page, user.email);
	await goToRecordDetail(page, 'Securities', security.name);
	await expect(page.getByRole('heading', { name: 'Price history' })).toBeVisible();
	await expect(page.getByText('No price history yet')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible();
	const positionsRegions = page.getByRole('region', { name: 'Positions' });
	await expect(positionsRegions).toHaveCount(2);
	await expect(positionsRegions.last()).toContainText('1');

	await seedSecurityBalance({
		account: account.id,
		security: security.id,
		owner: user.id,
		asOf: '2026-02-01T00:00:00.000Z',
		quantity: 10,
		price: 120,
		value: 1200,
		costBasis: 800
	});
	// NOTE: the overview fetches price history once per navigation (not via realtime), so a
	// reload is required for the newly-seeded quote to reach the chart.
	await page.reload();
	await expect(page.getByText('No price history yet')).not.toBeVisible();
	await expect(page.getByRole('img', { name: 'Price' })).toBeVisible();
});
