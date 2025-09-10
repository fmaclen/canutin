import type PocketBase from 'pocketbase';
import { getContext, setContext } from 'svelte';

import type { AccountBalancesResponse, AccountsResponse } from './pocketbase.schema';

type AccountWithBalance = AccountsResponse & { balance: number };

class AccountsContext {
	accounts: AccountWithBalance[] = $state([]);

	private _pb: PocketBase;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.getAll();
		this.realtimeSubscribe();
	}

	private async getAll() {
		const list = await this._pb.collection('accounts').getFullList<AccountsResponse>();

		const withBalances: AccountWithBalance[] = [];
		for (const a of list) {
			const res = await this._pb
				.collection('accountBalances')
				.getList<AccountBalancesResponse>(1, 1, { filter: `account='${a.id}'`, sort: '-created' });
			const value = res.items[0]?.value ?? 0;
			withBalances.push({ ...a, balance: value } as AccountWithBalance);
		}
		this.accounts = withBalances;
	}

	private realtimeSubscribe() {
		this._pb.collection('accounts').subscribe('*', () => this.getAll());
		this._pb.collection('accountBalances').subscribe('*', async (e) => {
			const accountId = e.record.account as string;
			const res = await this._pb
				.collection('accountBalances')
				.getList<AccountBalancesResponse>(1, 1, {
					filter: `account='${accountId}'`,
					sort: '-created'
				});
			const value = res.items[0]?.value ?? 0;
			this.accounts = this.accounts.map((x) => (x.id === accountId ? { ...x, balance: value } : x));
		});
	}

	dispose() {
		this._pb.collection('accounts').unsubscribe();
		this._pb.collection('accountBalances').unsubscribe();
	}
}

export const CONTEXT_KEY_ACCOUNTS = 'accounts';

export function setAccountsContext(pb: PocketBase) {
	return setContext(CONTEXT_KEY_ACCOUNTS, new AccountsContext(pb));
}

export function getAccountsContext() {
	return getContext<ReturnType<typeof setAccountsContext>>(CONTEXT_KEY_ACCOUNTS);
}
