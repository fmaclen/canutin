import { expect, test } from '@playwright/test';

import { goToPageViaSidebar, signIn } from './playwright.helpers';
import { getUserPB, pbSend, seedAccount, seedUser } from './pocketbase.helpers';

const IMPORT_PATH = '/api/canutin/import';
const REVERT_PATH = '/api/canutin/import/revert';

function securitiesPayload(sessionLabel: string) {
	return {
		sessionLabel,
		accounts: [
			{
				name: 'Brokerage',
				institution: 'Vanguard',
				balanceGroup: 'INVESTMENT',
				balanceType: 'Brokerage'
			}
		],
		securities: [{ name: 'Apple Inc', symbol: 'AAPL' }],
		securityBalances: [
			{
				accountName: 'Brokerage',
				securityName: 'Microsoft Corp',
				securitySymbol: 'MSFT',
				asOf: '2025-06-15T00:00:00.000Z',
				quantity: 5,
				price: 400,
				value: 2000,
				costBasis: 1800
			}
		],
		securityTransactions: [
			{
				accountName: 'Brokerage',
				securityName: 'Tesla Inc',
				securitySymbol: 'TSLA',
				date: '2025-06-10T00:00:00.000Z',
				type: 'buy',
				description: 'Bought Tesla shares',
				quantity: 2,
				price: 250,
				amount: 500
			}
		]
	};
}

test('first import auto-creates securities referenced anywhere', async () => {
	const user = await seedUser('alice');

	const result = await (
		await pbSend(IMPORT_PATH, securitiesPayload('alice-securities-run-1'), user.email)
	).json();

	expect(result.securities.created).toBe(3);
	expect(result.securities.existing).toBe(0);
	expect(result.securityBalances.created).toBe(1);
	expect(result.securityBalances.skipped).toBe(0);
	expect(result.securityTransactions.created).toBe(1);
	expect(result.securityTransactions.skipped).toBe(0);

	const pb = await getUserPB(user.email);
	const securities = await pb.collection('securities').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(securities.length).toBe(3);

	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balances.length).toBe(1);

	const trades = await pb.collection('securityTransactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(trades.length).toBe(1);
});

test('re-importing the same payload dedups securities, balances, and transactions', async () => {
	const user = await seedUser('bob');
	const payload = securitiesPayload('bob-securities-run-1');

	const first = await (await pbSend(IMPORT_PATH, payload, user.email)).json();
	expect(first.securities.created).toBe(3);
	expect(first.securityBalances.created).toBe(1);
	expect(first.securityTransactions.created).toBe(1);

	payload.sessionLabel = 'bob-securities-run-2';
	const second = await (await pbSend(IMPORT_PATH, payload, user.email)).json();

	expect(second.securities.created).toBe(0);
	expect(second.securities.existing).toBe(3);
	expect(second.securityBalances.created).toBe(0);
	expect(second.securityBalances.skipped).toBe(1);
	expect(second.securityTransactions.created).toBe(0);
	expect(second.securityTransactions.skipped).toBe(1);

	const pb = await getUserPB(user.email);
	const securities = await pb.collection('securities').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(securities.length).toBe(3);

	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balances.length).toBe(1);

	const trades = await pb.collection('securityTransactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(trades.length).toBe(1);
});

test('a name collision dedups to the existing security when the symbol does not match', async () => {
	const user = await seedUser('charlie');

	const payload1 = {
		sessionLabel: 'charlie-run-1',
		accounts: [{ name: 'Charlie Brokerage', balanceGroup: 'INVESTMENT', balanceType: 'Brokerage' }],
		securities: [{ name: 'Apple Inc.', symbol: 'AAPL' }]
	};

	const first = await (await pbSend(IMPORT_PATH, payload1, user.email)).json();
	expect(first.securities.created).toBe(1);

	const payload2 = {
		sessionLabel: 'charlie-run-2',
		securityBalances: [
			{
				accountName: 'Charlie Brokerage',
				securityName: 'Apple Inc.',
				securitySymbol: 'APPL',
				asOf: '2025-07-01T00:00:00.000Z',
				quantity: 1,
				price: 200,
				value: 200,
				costBasis: 200
			}
		]
	};

	const second = await (await pbSend(IMPORT_PATH, payload2, user.email)).json();
	expect(second.securities.created).toBe(0);
	expect(second.securities.existing).toBe(1);
	expect(second.securityBalances.created).toBe(1);
	expect(second.securityBalances.skipped).toBe(0);

	const pb = await getUserPB(user.email);
	const securities = await pb.collection('securities').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(securities.length).toBe(1);
	expect(securities[0].name).toBe('Apple Inc.');

	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balances.length).toBe(1);
	expect(balances[0].security).toBe(securities[0].id);
});

test('securityTransaction fallback dedup keys on account, security, date, and type', async () => {
	const user = await seedUser('diana');

	const payload1 = {
		sessionLabel: 'diana-run-1',
		accounts: [{ name: 'Diana Brokerage', balanceGroup: 'INVESTMENT', balanceType: 'Brokerage' }],
		securityTransactions: [
			{
				accountName: 'Diana Brokerage',
				securityName: 'Apple Inc',
				securitySymbol: 'AAPL',
				date: '2025-08-01T00:00:00.000Z',
				type: 'buy',
				description: 'Apple buy',
				quantity: 3,
				price: 180,
				amount: 540
			}
		]
	};

	const first = await (await pbSend(IMPORT_PATH, payload1, user.email)).json();
	expect(first.securityTransactions.created).toBe(1);

	const payload2 = {
		sessionLabel: 'diana-run-2',
		securityTransactions: [
			{
				accountName: 'Diana Brokerage',
				securityName: 'Apple Inc',
				securitySymbol: 'AAPL',
				date: '2025-08-01T00:00:00.000Z',
				type: 'buy',
				description: 'Apple buy',
				quantity: 3,
				price: 180,
				amount: 540
			}
		]
	};

	const second = await (await pbSend(IMPORT_PATH, payload2, user.email)).json();
	expect(second.securityTransactions.skipped).toBe(1);
	expect(second.securityTransactions.created).toBe(0);

	const payload3 = {
		sessionLabel: 'diana-run-3',
		securityTransactions: [
			{
				accountName: 'Diana Brokerage',
				securityName: 'Apple Inc',
				securitySymbol: 'AAPL',
				date: '2025-08-01T00:00:00.000Z',
				type: 'sell',
				description: 'Apple buy',
				quantity: 3,
				price: 180,
				amount: 540
			}
		]
	};

	const third = await (await pbSend(IMPORT_PATH, payload3, user.email)).json();
	expect(third.securityTransactions.created).toBe(1);
	expect(third.securityTransactions.skipped).toBe(0);

	const pb = await getUserPB(user.email);
	const trades = await pb.collection('securityTransactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(trades.length).toBe(2);
});

test('identical securityBalance is skipped but a changed number creates a new row', async () => {
	const user = await seedUser('emma');

	const payload1 = {
		sessionLabel: 'emma-run-1',
		accounts: [{ name: 'Emma Brokerage', balanceGroup: 'INVESTMENT', balanceType: 'Brokerage' }],
		securityBalances: [
			{
				accountName: 'Emma Brokerage',
				securityName: 'Apple Inc',
				securitySymbol: 'AAPL',
				asOf: '2025-09-01T00:00:00.000Z',
				quantity: 10,
				price: 150,
				value: 1500,
				costBasis: 1400
			}
		]
	};

	const first = await (await pbSend(IMPORT_PATH, payload1, user.email)).json();
	expect(first.securityBalances.created).toBe(1);

	const payload2 = {
		sessionLabel: 'emma-run-2',
		securityBalances: [
			{
				accountName: 'Emma Brokerage',
				securityName: 'Apple Inc',
				securitySymbol: 'AAPL',
				asOf: '2025-09-01T00:00:00.000Z',
				quantity: 10,
				price: 150,
				value: 1500,
				costBasis: 1400
			}
		]
	};

	const second = await (await pbSend(IMPORT_PATH, payload2, user.email)).json();
	expect(second.securityBalances.skipped).toBe(1);
	expect(second.securityBalances.created).toBe(0);

	const payload3 = {
		sessionLabel: 'emma-run-3',
		securityBalances: [
			{
				accountName: 'Emma Brokerage',
				securityName: 'Apple Inc',
				securitySymbol: 'AAPL',
				asOf: '2025-09-01T00:00:00.000Z',
				quantity: 10,
				price: 175,
				value: 1500,
				costBasis: 1400
			}
		]
	};

	const third = await (await pbSend(IMPORT_PATH, payload3, user.email)).json();
	expect(third.securityBalances.created).toBe(1);
	expect(third.securityBalances.skipped).toBe(0);

	const pb = await getUserPB(user.email);
	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balances.length).toBe(2);
});

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

test('security balance with a foreign accountId is rejected for ownership', async () => {
	const owner = await seedUser('grace');
	const intruder = await seedUser('gregory');
	const ownerAccount = await seedAccount({
		name: 'Grace Brokerage',
		balanceGroup: 'INVESTMENT',
		balanceType: 'Brokerage',
		owner: owner.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'gregory-foreign-balance',
				securityBalances: [
					{
						accountId: ownerAccount.id,
						accountName: 'Grace Brokerage',
						securityName: 'Apple Inc',
						securitySymbol: 'AAPL',
						asOf: '2025-06-15T00:00:00.000Z',
						quantity: 5,
						price: 100,
						value: 500,
						costBasis: 450
					}
				]
			},
			intruder.email
		)
	).json();
	expect(result.status).toBe('failed');
	expect(result.recordsFailed).toBe(1);
	expect(result.securityBalances.created).toBe(0);

	const ownerPB = await getUserPB(owner.email);
	const onOwnerAccount = await ownerPB.collection('securityBalances').getFullList({
		filter: `account = "${ownerAccount.id}"`
	});
	expect(onOwnerAccount.length).toBe(0);

	const intruderPB = await getUserPB(intruder.email);
	const intruderBalances = await intruderPB.collection('securityBalances').getFullList({
		filter: `owner = "${intruder.id}"`
	});
	expect(intruderBalances.length).toBe(0);
});

test('ambiguous account name in a security transaction becomes a row error', async () => {
	const user = await seedUser('greta');
	await seedAccount({
		name: 'Brokerage',
		institution: 'Fidelity',
		balanceGroup: 'INVESTMENT',
		balanceType: 'Brokerage',
		owner: user.id
	});
	await seedAccount({
		name: 'Brokerage',
		institution: 'Schwab',
		balanceGroup: 'INVESTMENT',
		balanceType: 'Brokerage',
		owner: user.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'greta-ambiguous-trade',
				securityTransactions: [
					{
						accountName: 'Brokerage',
						securityName: 'Tesla Inc',
						securitySymbol: 'TSLA',
						date: '2025-06-10T00:00:00.000Z',
						type: 'buy',
						description: 'Bought Tesla shares',
						quantity: 2,
						price: 250,
						amount: 500
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('failed');
	expect(result.recordsFailed).toBe(1);
	expect(result.securityTransactions.created).toBe(0);

	const pb = await getUserPB(user.email);
	const trades = await pb.collection('securityTransactions').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(trades.length).toBe(0);
});

test('security balance with a unique account name resolves to that account', async () => {
	const user = await seedUser('gerald');
	const brokerage = await seedAccount({
		name: 'Gerald Brokerage',
		balanceGroup: 'INVESTMENT',
		balanceType: 'Brokerage',
		owner: user.id
	});

	const result = await (
		await pbSend(
			IMPORT_PATH,
			{
				sessionLabel: 'gerald-unique-balance',
				securityBalances: [
					{
						accountName: 'Gerald Brokerage',
						securityName: 'Apple Inc',
						securitySymbol: 'AAPL',
						asOf: '2025-06-15T00:00:00.000Z',
						quantity: 5,
						price: 100,
						value: 500,
						costBasis: 450
					}
				]
			},
			user.email
		)
	).json();
	expect(result.status).toBe('completed');
	expect(result.recordsFailed).toBe(0);
	expect(result.securityBalances.created).toBe(1);

	const pb = await getUserPB(user.email);
	const balances = await pb.collection('securityBalances').getFullList({
		filter: `owner = "${user.id}"`
	});
	expect(balances.length).toBe(1);
	expect(balances[0].account).toBe(brokerage.id);
});
