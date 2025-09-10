import PocketBase, { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import type { AccountBalancesResponse, AccountsResponse } from './pocketbase.schema';

type AccountWithBalance = AccountsResponse & { balance: number };

class AccountsContext {
	accounts: AccountWithBalance[] = $state([]);

	private _pb: PocketBase;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.init();
	}

	private async init() {
		await this.getAccounts();
		await this.getAccountBalances();
		this.realtimeSubscribe();
	}

	private async getAccounts() {
		const list = await this._pb.collection('accounts').getFullList<AccountsResponse>();
		const map = new Map<string, number>(this.accounts.map((a) => [a.id, a.balance]));
		this.accounts = list.map((a) => ({ ...a, balance: map.get(a.id) ?? 0 }));
	}

	private async getAccountBalance(accountId: string) {
		const res = await this._pb
			.collection('accountBalances')
			.getList<AccountBalancesResponse>(1, 1, {
				filter: `account='${accountId}'`,
				sort: '-created'
			});
		const value = res.items[0]?.value ?? 0;
		this.accounts = this.accounts.map((x) => (x.id === accountId ? { ...x, balance: value } : x));
	}

	private async getAccountBalances() {
		for (const a of this.accounts) {
			await this.getAccountBalance(a.id);
		}
	}

	private realtimeSubscribe() {
		this._pb.collection('accounts').subscribe('*', () => this.getAccounts());
		this._pb
			.collection('accountBalances')
			.subscribe('*', (e: RecordSubscription<AccountBalancesResponse>) => {
				const accountId = e.record.account;
				if (!accountId) return;
				this.getAccountBalance(accountId);
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
