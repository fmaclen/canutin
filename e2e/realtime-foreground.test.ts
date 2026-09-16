import { expect, test } from '@playwright/test';

import {
	AccountsBalanceGroupOptions,
	AssetsBalanceGroupOptions
} from '../src/lib/pocketbase.schema';
import { signIn } from './playwright.helpers';
import {
	getUserPB,
	seedAccount,
	seedAccountBalance,
	seedAccountShare,
	seedAsset,
	seedAssetBalance,
	seedAssetShare,
	seedUser
} from './pocketbase.helpers';

for (const signal of ['visibilitychange', 'online', 'reload']) {
	test(`net worth recovers silently missed shares on ${signal}`, async ({ page }) => {
		const leonie = await seedUser('leonie');
		const cedric = await seedUser('cedric');
		const ownedAccount = await seedAccount({
			name: 'Personal investments',
			balanceGroup: AccountsBalanceGroupOptions.INVESTMENT,
			balanceType: 'Brokerage',
			owner: leonie.id
		});
		await seedAccountBalance({
			account: ownedAccount.id,
			owner: leonie.id,
			asOf: new Date().toISOString(),
			value: 1025
		});
		const account = await seedAccount({
			name: 'Everyday checking',
			balanceGroup: AccountsBalanceGroupOptions.CASH,
			balanceType: 'Checking',
			owner: cedric.id
		});
		const accountBalance = await seedAccountBalance({
			account: account.id,
			owner: cedric.id,
			asOf: new Date().toISOString(),
			value: 4000
		});
		const asset = await seedAsset({
			name: 'Family artwork',
			balanceGroup: AssetsBalanceGroupOptions.OTHER,
			balanceType: 'Other asset',
			owner: cedric.id
		});
		const assetBalance = await seedAssetBalance({
			asset: asset.id,
			owner: cedric.id,
			asOf: new Date().toISOString(),
			marketValue: 8000
		});
		const cedricPB = await getUserPB(cedric.email);

		// Closing the native source emits no error, so the SDK never marks its stores stale.
		await page.addInitScript(() => {
			const NativeEventSource = window.EventSource;
			const sources: EventSource[] = [];
			window.EventSource = class extends NativeEventSource {
				constructor(url: string | URL, init?: EventSourceInit) {
					super(url, init);
					sources.push(this);
				}
			};
			window.addEventListener('close-realtime-for-test', () => {
				for (const source of sources) source.close();
			});
		});
		await page.goto('/');
		await Promise.all([
			page.waitForResponse((response) => {
				const request = response.request();
				const subscriptions = request.postData() ?? '';
				return (
					new URL(response.url()).pathname === '/api/realtime' &&
					request.method() === 'POST' &&
					response.ok() &&
					subscriptions.includes('accountBalances/*') &&
					subscriptions.includes('assetBalances/*')
				);
			}),
			signIn(page, leonie.email)
		]);
		const netWorth = page.getByRole('region', { name: 'Net worth' });
		await expect(netWorth).toContainText('$1,025');

		await page.evaluate((signal) => {
			window.dispatchEvent(new Event('close-realtime-for-test'));
			if (signal === 'visibilitychange') {
				Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
				Object.defineProperty(document, 'hidden', { configurable: true, value: true });
				document.dispatchEvent(new Event('visibilitychange'));
			}
		}, signal);
		await Promise.all([
			seedAccountShare({
				account: account.id,
				recipient: leonie.id,
				recipientEmail: leonie.email,
				grantedBy: cedric.id,
				accessRole: 'VIEWER',
				perspective: 'NORMAL',
				includeInNetWorth: true
			}),
			seedAssetShare({
				asset: asset.id,
				recipient: leonie.id,
				recipientEmail: leonie.email,
				grantedBy: cedric.id,
				accessRole: 'VIEWER',
				perspective: 'NORMAL',
				includeInNetWorth: true
			})
		]);
		await expect(netWorth).toContainText('$1,025');

		if (signal === 'reload') {
			await page.reload();
		} else {
			await page.evaluate((signal) => {
				if (signal === 'visibilitychange') {
					Object.defineProperty(document, 'visibilityState', {
						configurable: true,
						value: 'visible'
					});
					Object.defineProperty(document, 'hidden', { configurable: true, value: false });
					document.dispatchEvent(new Event('visibilitychange'));
				} else {
					window.dispatchEvent(new Event('online'));
				}
			}, signal);
		}
		await expect(netWorth).toContainText('$13,025');

		if (signal === 'visibilitychange') {
			// Reload must fetch current balances using the saved session, without signing in again.
			await Promise.all([
				cedricPB.collection('accountBalances').update(accountBalance.id, { value: 5000 }),
				cedricPB.collection('assetBalances').update(assetBalance.id, { marketValue: 9000 })
			]);
			await expect(netWorth).toContainText('$13,025');

			await page.reload();
			await expect(netWorth).toContainText('$15,025');
		}

		// Keep the same app stores when navigating, so navigation cannot repair missing shares.
		const balanceSheetLink = page.getByRole('link', { name: 'Balance sheet', exact: true });
		if (!(await balanceSheetLink.isVisible())) {
			await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
			await expect(balanceSheetLink).toBeVisible();
		}
		await balanceSheetLink.click();
		await expect(page.getByRole('link', { name: ownedAccount.name, exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: account.name, exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: asset.name, exact: true })).toBeVisible();
	});
}
