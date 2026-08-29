import type { Page } from '@playwright/test';

// Scenario shapes mirror Plaid's wire format so the fake server can hand them back untouched.

export type FakePlaidAccount = {
	account_id: string;
	name: string;
	mask: string;
	type: string;
	subtype: string;
	balances: { current: number | null; iso_currency_code: string };
};

export type FakePlaidTransaction = {
	account_id: string;
	transaction_id: string;
	date: string;
	name: string;
	merchant_name?: string;
	original_description?: string;
	amount: number;
	pending?: boolean;
	personal_finance_category?: { primary: string };
};

// One page of `/transactions/sync`. The server hands pages out in order and mints the cursors,
// so an array of two pages is what a test uses to exercise cursor pagination.
export type FakePlaidTransactionPage = {
	added?: FakePlaidTransaction[];
	modified?: FakePlaidTransaction[];
	removed?: { account_id: string; transaction_id: string }[];
};

export type FakePlaidSecurity = {
	security_id: string;
	name: string;
	ticker_symbol: string;
	type: string;
	iso_currency_code: string;
};

export type FakePlaidHolding = {
	account_id: string;
	security_id: string;
	quantity: number;
	institution_price: number;
	institution_value: number;
	cost_basis?: number;
};

export type FakePlaidInvestmentTransaction = {
	account_id: string;
	security_id: string;
	investment_transaction_id: string;
	date: string;
	type: string;
	subtype: string;
	name: string;
	quantity: number;
	price: number;
	amount: number;
	fees?: number;
};

// A linked bank, Plaid's "item". Its access token and item id are derived from `publicToken`,
// which is also what the widget stub hands to the app, so a test only picks one string per bank.
export type FakePlaidItem = {
	publicToken: string;
	accounts: FakePlaidAccount[];
	transactionPages?: FakePlaidTransactionPage[];
	holdings?: FakePlaidHolding[];
	securities?: FakePlaidSecurity[];
	investmentTransactions?: FakePlaidInvestmentTransaction[];
	// Plaid path (`/transactions/sync`, …) to the `error_code` this bank answers with instead of
	// data, which is how a test provokes ITEM_LOGIN_REQUIRED and the other upstream failure branches.
	errors?: Record<string, string>;
};

// One port above PocketBase, so every checkout's fake Plaid server follows the port pair its
// worktree already owns. Read at call time because the ports arrive from `.env`.
export function plaidFakePort() {
	return Number(process.env.PB_PORT ?? 42070) + 1;
}

// Declares what a bank returns, replacing anything previously declared under the same
// `publicToken` — including the cursors already handed out for it. Banks are only ever addressed
// by their own token, so tests running in parallel workers never disturb each other's.
export async function setPlaidItem(item: FakePlaidItem) {
	const response = await fetch(`http://127.0.0.1:${plaidFakePort()}/_control`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(item)
	});
	if (!response.ok) {
		throw new Error(`Fake Plaid server rejected the bank with status ${response.status}`);
	}
}

// Serves a stand-in for Plaid's Link widget in place of the script the app pulls from Plaid's CDN.
// `outcome` picks which of the two callbacks the widget fires once the app opens it.
export async function stubPlaidWidget(
	page: Page,
	widget: { publicToken: string; institutionName: string; outcome: 'success' | 'exit' }
) {
	await page.route('https://cdn.plaid.com/link/v2/stable/link-initialize.js', (route) =>
		route.fulfill({
			contentType: 'application/javascript',
			body: `
				const widget = ${JSON.stringify(widget)};
				window.Plaid = {
					create(options) {
						// A token from anywhere else means the backend is talking to a real Plaid
						// environment instead of the fake server.
						if (!String(options.token).startsWith('link-token-fake')) {
							throw new Error('Plaid link token did not come from the fake Plaid server');
						}
						return {
							open() {
								queueMicrotask(() => {
									if (widget.outcome === 'exit') {
										options.onExit();
										return;
									}
									options.onSuccess(widget.publicToken, {
										institution: { name: widget.institutionName }
									});
								});
							},
							destroy() {}
						};
					}
				};
			`
		})
	);
}
