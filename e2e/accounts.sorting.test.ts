import { expect, test } from '@playwright/test';

import { AccountsBalanceGroupOptions } from '../src/lib/pocketbase.schema';
import { getRowIndex, goToPageViaSidebar, signIn } from './playwright.helpers';
import { seedAccount, seedAccountBalance, seedTransaction, seedUser } from './pocketbase.helpers';

test.describe('accounts table sorting', () => {
	test('clicking Balance header sorts by balance descending then ascending', async ({ page }) => {
		const user = await seedUser('alice');

		await seedAccount({
			name: 'Low Balance Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 100
			})
		);

		await seedAccount({
			name: 'High Balance Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Savings'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 5000
			})
		);

		await seedAccount({
			name: 'Mid Balance Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 1000
			})
		);

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'High Balance Account' })).toBeVisible();

		const rows = page.locator('tbody tr');

		// Default sort is balance DESC (highest first)
		expect(await getRowIndex(rows, 'High Balance Account')).toBeLessThan(
			await getRowIndex(rows, 'Mid Balance Account')
		);
		expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
			await getRowIndex(rows, 'Low Balance Account')
		);

		// Click Balance header - default is already Balance DESC, so clicking toggles to ASC
		const balanceHeader = page.getByRole('button', { name: 'Balance' });
		await balanceHeader.click();
		await expect(page).toHaveURL(/sort=balance/);
		await expect(page).toHaveURL(/dir=asc/);

		// Verify order is now ascending (lowest first)
		expect(await getRowIndex(rows, 'Low Balance Account')).toBeLessThan(
			await getRowIndex(rows, 'Mid Balance Account')
		);
		expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
			await getRowIndex(rows, 'High Balance Account')
		);

		// Click again - should toggle back to DESC
		await balanceHeader.click();
		await expect(page).toHaveURL(/dir=desc/);

		// Verify order is back to descending (highest first)
		expect(await getRowIndex(rows, 'High Balance Account')).toBeLessThan(
			await getRowIndex(rows, 'Mid Balance Account')
		);
		expect(await getRowIndex(rows, 'Mid Balance Account')).toBeLessThan(
			await getRowIndex(rows, 'Low Balance Account')
		);
	});

	test('clicking Account header sorts alphabetically', async ({ page }) => {
		const user = await seedUser('bob');

		await seedAccount({
			name: 'Zebra Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 500
			})
		);

		await seedAccount({
			name: 'Alpha Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 500
			})
		);

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'Zebra Account' })).toBeVisible();

		const rows = page.locator('tbody tr');

		// Click Account header - first click should sort DESC (Z first)
		const accountHeader = page.getByRole('button', { name: 'Account', exact: true });
		await accountHeader.click();

		await expect(page).toHaveURL(/sort=name/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex(rows, 'Zebra Account')).toBeLessThan(
			await getRowIndex(rows, 'Alpha Account')
		);

		// Click again - should toggle to ASC (A first)
		await accountHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex(rows, 'Alpha Account')).toBeLessThan(
			await getRowIndex(rows, 'Zebra Account')
		);
	});

	test('clicking Institution header sorts by institution', async ({ page }) => {
		const user = await seedUser('carol');

		await seedAccount({
			name: 'Chase Checking',
			institution: 'Chase Bank',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 1000
			})
		);

		await seedAccount({
			name: 'Wells Fargo Savings',
			institution: 'Wells Fargo',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Savings'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 2000
			})
		);

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'Chase Checking' })).toBeVisible();

		// Click Institution header
		const institutionHeader = page.getByRole('button', { name: 'Institution' });
		await institutionHeader.click();

		await expect(page).toHaveURL(/sort=institution/);
		await expect(page).toHaveURL(/dir=desc/);

		// Click again - toggle to ASC
		await institutionHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
	});

	test('clicking Transactions header sorts by transaction count', async ({ page }) => {
		const user = await seedUser('diana');

		const manyTx = await seedAccount({
			name: 'Many Transactions',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: manyTx.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 1000
		});
		for (let i = 0; i < 5; i++) {
			await seedTransaction({
				account: manyTx.id,
				owner: user.id,
				date: new Date().toISOString(),
				description: `Transaction ${i}`,
				value: 100
			});
		}

		const fewTx = await seedAccount({
			name: 'Few Transactions',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		});
		await seedAccountBalance({
			account: fewTx.id,
			owner: user.id,
			asOf: new Date().toISOString(),
			value: 2000
		});
		await seedTransaction({
			account: fewTx.id,
			owner: user.id,
			date: new Date().toISOString(),
			description: 'Single transaction',
			value: 50
		});

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'Many Transactions' })).toBeVisible();

		const rows = page.locator('tbody tr');

		// Click Transactions header - DESC first (most transactions first)
		const txHeader = page.getByRole('button', { name: 'Transactions' });
		await txHeader.click();

		await expect(page).toHaveURL(/sort=transactions/);
		await expect(page).toHaveURL(/dir=desc/);
		expect(await getRowIndex(rows, 'Many Transactions')).toBeLessThan(
			await getRowIndex(rows, 'Few Transactions')
		);

		// Click again - ASC (fewest first)
		await txHeader.click();
		await expect(page).toHaveURL(/dir=asc/);
		expect(await getRowIndex(rows, 'Few Transactions')).toBeLessThan(
			await getRowIndex(rows, 'Many Transactions')
		);
	});

	test('sort state persists in URL and survives page reload', async ({ page }) => {
		const user = await seedUser('ellie');

		await seedAccount({
			name: 'Account One',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 1000
			})
		);

		await seedAccount({
			name: 'Account Two',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Savings'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 2000
			})
		);

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'Account One' })).toBeVisible();

		// Sort by name ASC
		const accountHeader = page.getByRole('button', { name: 'Account', exact: true });
		await accountHeader.click(); // DESC
		await accountHeader.click(); // ASC

		await expect(page).toHaveURL(/sort=name/);
		await expect(page).toHaveURL(/dir=asc/);

		const rows = page.locator('tbody tr');

		expect(await getRowIndex(rows, 'Account One')).toBeLessThan(
			await getRowIndex(rows, 'Account Two')
		);

		// Reload page
		await page.reload();

		// Sort state should persist
		await expect(page).toHaveURL(/sort=name/);
		await expect(page).toHaveURL(/dir=asc/);
		await expect(page.getByRole('row', { name: 'Account One' })).toBeVisible();
		expect(await getRowIndex(rows, 'Account One')).toBeLessThan(
			await getRowIndex(rows, 'Account Two')
		);
	});

	test('sort indicator shows on active column', async ({ page }) => {
		const user = await seedUser('faith');

		await seedAccount({
			name: 'Test Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 1000
			})
		);

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'Test Account' })).toBeVisible();

		// Default sort is Balance DESC - the th parent should have aria-sort
		const balanceButton = page.getByRole('button', { name: 'Balance' });
		const balanceTh = balanceButton.locator('xpath=..');
		await expect(balanceTh).toHaveAttribute('aria-sort', 'descending');

		// Click once to toggle to ASC
		await balanceButton.click();
		await expect(balanceTh).toHaveAttribute('aria-sort', 'ascending');

		// Click different column - Balance th should lose aria-sort
		const accountButton = page.getByRole('button', { name: 'Account', exact: true });
		const accountTh = accountButton.locator('xpath=..');
		await accountButton.click();

		await expect(accountTh).toHaveAttribute('aria-sort', 'descending');
		await expect(balanceTh).not.toHaveAttribute('aria-sort');
	});

	test('sorting works correctly across filter tabs', async ({ page }) => {
		const user = await seedUser('grace');

		await seedAccount({
			name: 'Open Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Checking'
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 3000
			})
		);

		await seedAccount({
			name: 'Closed Account',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			owner: user.id,
			balanceType: 'Savings',
			closed: new Date().toISOString()
		}).then((acc) =>
			seedAccountBalance({
				account: acc.id,
				owner: user.id,
				asOf: new Date().toISOString(),
				value: 1000
			})
		);

		await page.goto('/');
		await signIn(page, user.email);
		await goToPageViaSidebar(page, 'Accounts');
		await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

		await expect(page.getByRole('row', { name: 'Open Account' })).toBeVisible();

		// Sort by name ASC
		const accountHeader = page.getByRole('button', { name: 'Account', exact: true });
		await accountHeader.click(); // DESC
		await accountHeader.click(); // ASC

		await expect(page).toHaveURL(/sort=name/);
		await expect(page).toHaveURL(/dir=asc/);

		// Switch to All tab - sorting should persist
		await page.getByRole('tab', { name: 'All' }).click();
		await expect(page).toHaveURL(/sort=name/);
		await expect(page).toHaveURL(/dir=asc/);

		const rows = page.locator('tbody tr');

		// C comes before O alphabetically
		expect(await getRowIndex(rows, 'Closed Account')).toBeLessThan(
			await getRowIndex(rows, 'Open Account')
		);
	});
});
