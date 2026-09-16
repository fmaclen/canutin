import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import {
	DEFAULT_PASSWORD,
	getAdminPB,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedUser
} from './pocketbase.helpers';

// Sign-ups ship closed by default (users.createRule = null), so anonymous registration is
// rejected at the collection rule rather than by the form.
test('sign-ups are closed by default', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Sign up' }).click();
	await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();

	await page.getByLabel('Email').fill(`closed.${Date.now()}@example.com`);
	await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
	await page.getByLabel('Confirm password').fill(DEFAULT_PASSWORD);
	await page.getByRole('button', { name: 'Sign up' }).click();

	await expect(page.getByText('Sign-ups are closed on this server')).toBeVisible();
	await expect(page.getByText('Account created, you can now log in')).not.toBeVisible();
});

test('expired saved session returns to login before showing financial totals', async ({ page }) => {
	const user = await seedUser('celestine');
	const sharer = await seedUser('edmund');
	const account = await seedAccount({
		name: 'Personal brokerage',
		balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
		balanceType: 'Brokerage',
		owner: user.id
	});
	const personalBalance = await seedAccountBalance({
		account: account.id,
		owner: user.id,
		asOf: new Date().toISOString(),
		value: 1025
	});
	const sharedAccount = await seedAccount({
		name: 'Shared checking',
		balanceGroup: AccountsBalanceGroupOptions.CASH,
		balanceType: 'Checking',
		owner: sharer.id
	});
	await seedAccountBalance({
		account: sharedAccount.id,
		owner: sharer.id,
		asOf: new Date().toISOString(),
		value: 4000
	});
	await seedAccountShare({
		account: sharedAccount.id,
		recipient: user.id,
		recipientEmail: user.email,
		grantedBy: sharer.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	const sharedAsset = await seedAsset({
		name: 'Shared artwork',
		balanceGroup: AssetsBalanceGroupOptions.OTHER,
		balanceType: 'Artwork',
		owner: sharer.id
	});
	await seedAssetBalance({
		asset: sharedAsset.id,
		owner: sharer.id,
		asOf: new Date().toISOString(),
		marketValue: 8000
	});
	await seedAssetShare({
		asset: sharedAsset.id,
		recipient: user.id,
		recipientEmail: user.email,
		grantedBy: sharer.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});
	await page.goto('/');
	await signIn(page, user.email);
	await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$13,025');

	// A server-issued short-lived token preserves a valid signature and expires while the tab is
	// closed. Impersonation disables renewal, so this tests expiry, not normal token refreshing.
	const admin = await getAdminPB();
	const expiring = await admin.collection('users').impersonate(user.id, 1);
	await page.evaluate(
		(session) => localStorage.setItem('pocketbase_auth', JSON.stringify(session)),
		{ token: expiring.authStore.token, record: expiring.authStore.record }
	);
	const context = page.context();
	await page.close();
	await expect.poll(() => expiring.authStore.isValid).toBe(false);
	await expect(expiring.collection('users').authRefresh()).rejects.toMatchObject({ status: 401 });
	const reopened = await context.newPage();
	await reopened.goto('/');
	await expect(reopened.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
	await expect(reopened.getByRole('region', { name: 'Net worth' })).not.toBeVisible();

	for (const signal of ['visibilitychange', 'realtime']) {
		await signIn(reopened, user.email);
		await expect(reopened.getByRole('region', { name: 'Net worth' })).toContainText('$13,025');

		// A storage event updates the live SDK session as it would when another tab renews it.
		const expiringLiveSession = await admin.collection('users').impersonate(user.id, 1);
		await reopened.evaluate(
			(session) => {
				const newValue = JSON.stringify(session);
				localStorage.setItem('pocketbase_auth', newValue);
				window.dispatchEvent(new StorageEvent('storage', { key: 'pocketbase_auth', newValue }));
			},
			{ token: expiringLiveSession.authStore.token, record: expiringLiveSession.authStore.record }
		);
		await expect.poll(() => expiringLiveSession.authStore.isValid).toBe(false);

		if (signal === 'visibilitychange') {
			await reopened.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		} else {
			// The existing realtime connection can still deliver an event after the saved token expires.
			await admin.collection('accountBalances').update(personalBalance.id, { value: 2025 });
		}
		await expect(reopened.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
		await expect(reopened.getByRole('region', { name: 'Net worth' })).not.toBeVisible();
	}
});
