// Stand-in for the Plaid API, started by Playwright and pointed at by the backend's
// PLAID_BASE_URL. It implements only the endpoints the Go backend calls, keeps everything in
// memory, and returns whatever the test declared for the bank the request addresses.

import { plaidFakePort, type FakePlaidItem } from './plaid.helpers';

type PlaidRequestBody = {
	public_token?: string;
	access_token?: string;
	cursor?: string;
	options?: { count?: number; offset?: number };
};

const items = new Map<string, FakePlaidItem>();

function plaidError(errorCode: string) {
	return Response.json(
		{
			error_type: 'ITEM_ERROR',
			error_code: errorCode,
			error_message: `Fake Plaid server returned ${errorCode}`,
			request_id: 'fake-request-id'
		},
		{ status: 400 }
	);
}

function handle(path: string, body: PlaidRequestBody) {
	// A link token is minted before any bank is chosen, so it is the one response with no item
	// behind it. The prefix is what the widget stub checks to prove it is talking to this server.
	if (path === '/link/token/create') {
		return Response.json({ link_token: 'link-token-fake', request_id: 'fake-request-id' });
	}

	const publicToken = body.public_token ?? body.access_token?.replace('access-', '') ?? '';
	const item = items.get(publicToken);
	if (!item) return plaidError(body.public_token ? 'INVALID_PUBLIC_TOKEN' : 'INVALID_ACCESS_TOKEN');

	const injectedError = item.errors?.[path];
	if (injectedError) return plaidError(injectedError);

	switch (path) {
		case '/item/public_token/exchange':
			return Response.json({
				access_token: `access-${item.publicToken}`,
				item_id: `item-${item.publicToken}`,
				request_id: 'fake-request-id'
			});

		case '/accounts/get':
			return Response.json({ accounts: item.accounts, request_id: 'fake-request-id' });

		case '/transactions/sync': {
			// Cursors are minted here as `cursor-<pages served>`, so the connection's stored cursor
			// is what picks the next page and a re-sync of an unchanged bank returns nothing.
			const pages = item.transactionPages ?? [];
			const cursor = body.cursor ?? '';
			const pageIndex = cursor === '' ? 0 : Number(cursor.replace('cursor-', ''));
			const page = pages[pageIndex];
			return Response.json({
				added: page?.added ?? [],
				modified: page?.modified ?? [],
				removed: page?.removed ?? [],
				next_cursor: page ? `cursor-${pageIndex + 1}` : `cursor-${pageIndex}`,
				has_more: pageIndex + 1 < pages.length,
				request_id: 'fake-request-id'
			});
		}

		case '/investments/holdings/get':
			return Response.json({
				holdings: item.holdings ?? [],
				securities: item.securities ?? [],
				accounts: item.accounts,
				request_id: 'fake-request-id'
			});

		case '/investments/transactions/get': {
			const investmentTransactions = item.investmentTransactions ?? [];
			const offset = body.options?.offset ?? 0;
			const count = body.options?.count ?? investmentTransactions.length;
			return Response.json({
				investment_transactions: investmentTransactions.slice(offset, offset + count),
				securities: item.securities ?? [],
				total_investment_transactions: investmentTransactions.length,
				request_id: 'fake-request-id'
			});
		}

		case '/item/remove':
			items.delete(item.publicToken);
			return Response.json({ request_id: 'fake-request-id' });

		default:
			return plaidError('INVALID_REQUEST');
	}
}

Bun.serve({
	port: plaidFakePort(),
	async fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === '/_control') {
			const item: FakePlaidItem = await request.json();
			items.set(item.publicToken, item);
			return new Response(null, { status: 204 });
		}

		const body: PlaidRequestBody = await request.json();
		return handle(pathname, body);
	}
});
