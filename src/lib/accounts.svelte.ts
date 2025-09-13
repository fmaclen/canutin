import PocketBase, { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { getOrCreateBalanceTypesContext } from './balance-types.svelte';
import type { AccountBalancesResponse, AccountsResponse } from './pocketbase.schema';

type AccountWithBalance = AccountsResponse & { balance: number };

class AccountsContext {
	accounts: AccountWithBalance[] = $state([]);
	accountsView = $derived.by(() =>
		this.accounts.map((a) => ({ ...a, balanceTypeName: this._bt.getName(a.balanceType) }))
	);

	private _pb: PocketBase;
	private _bt: ReturnType<typeof getOrCreateBalanceTypesContext>;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this._bt = getOrCreateBalanceTypesContext(pb);
		this.init();
	}

	private async init() {
		const list = await this._pb.collection('accounts').getFullList<AccountsResponse>();
		this.accounts = list.map((a) => ({ ...a, balance: 0 }));
		for (const a of this.accounts) {
			const value = await this.getLatestAccountBalance(a.id);
			this.accounts = this.accounts.map((x) => (x.id === a.id ? { ...x, balance: value } : x));
		}
		this.realtimeSubscribe();
	}

	private realtimeSubscribe() {
		this._pb.collection('accounts').subscribe('*', this.onAccountEvent.bind(this));
		this._pb.collection('accountBalances').subscribe('*', this.onAccountBalanceEvent.bind(this));
	}

	private async onAccountEvent(e: RecordSubscription<AccountsResponse>) {
		if (e.action === 'create') {
			// ensure the balance type is known in the shared cache
			await this._bt.ensureLoaded(e.record.balanceType);
			this.accounts = [...this.accounts, { ...e.record, balance: 0 }];
		} else if (e.action === 'update') {
			const balance = this.accounts.find((a) => a.id === e.record.id)?.balance ?? 0;
			await this._bt.ensureLoaded(e.record.balanceType);
			this.accounts = this.accounts.map((x) =>
				x.id === e.record.id ? { ...e.record, balance } : x
			);
		} else if (e.action === 'delete') {
			this.accounts = this.accounts.filter((x) => x.id !== e.record.id);
		}
	}

	private async onAccountBalanceEvent(e: RecordSubscription<AccountBalancesResponse>) {
		if (!e.action) return;
		const accountId = e.record.account;
		const value = await this.getLatestAccountBalance(accountId);
		this.accounts = this.accounts.map((x) => (x.id === accountId ? { ...x, balance: value } : x));
	}

	private async getLatestAccountBalance(accountId: string) {
		const res = await this._pb
			.collection('accountBalances')
			.getList<AccountBalancesResponse>(1, 1, {
				filter: `account='${accountId}'`,
				sort: '-asOf,-created,-id'
			});
		return res.items[0]?.value ?? 0;
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
