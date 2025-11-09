import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { setBalanceTypesContext } from './balance-types.svelte';
import type { AccountBalancesResponse, AccountsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

type AccountWithBalance = AccountsResponse & { balance: number };

class AccountsContext {
	accounts: AccountWithBalance[] = $state([]);
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;

	constructor(
		pb: PocketBaseContext,
		balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
	) {
		this._pb = pb;
		this.balanceTypesContext = balanceTypesContext;
		this.init();
	}

	getTypeName(id: string) {
		return this.balanceTypesContext.getName(id);
	}

	getAccount(id: string): AccountWithBalance | undefined {
		return this.accounts.find((a) => a.id === id);
	}

	private async init() {
		try {
			const list = await this._pb.authedClient
				.collection('accounts')
				.getFullList<AccountsResponse>();
			this.accounts = list.map((a) => ({ ...a, balance: 0 }));
			for (const a of this.accounts) {
				const value = await this.getLatestAccountBalance(a.id);
				this.accounts = this.accounts.map((x) => (x.id === a.id ? { ...x, balance: value } : x));
			}
			this.lastBalanceEvent = Date.now();
			this.realtimeSubscribe();
			this.isLoading = false;
		} catch (error) {
			this._pb.handleConnectionError(error, 'accounts', 'init');
			this.isLoading = false;
		}
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('accounts')
			.subscribe('*', this.onAccountEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_accounts'));
		this._pb.authedClient
			.collection('accountBalances')
			.subscribe('*', this.onAccountBalanceEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_balances'));
	}

	private async onAccountEvent(e: RecordSubscription<AccountsResponse>) {
		if (e.action === 'create') {
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.accounts = [...this.accounts, { ...e.record, balance: 0 }];
		} else if (e.action === 'update') {
			const balance = this.accounts.find((a) => a.id === e.record.id)?.balance ?? 0;
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
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
		try {
			const value = await this.getLatestAccountBalance(accountId);
			this.accounts = this.accounts.map((x) => (x.id === accountId ? { ...x, balance: value } : x));
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			console.error('[accounts:update_balance_on_event]', error);
		}
	}

	private async getLatestAccountBalance(accountId: string) {
		const res = await this._pb.authedClient
			.collection('accountBalances')
			.getList<AccountBalancesResponse>(1, 1, {
				filter: `account='${accountId}'`,
				sort: '-asOf,-created,-id'
			});
		return res.items[0]?.value ?? 0;
	}

	dispose() {
		this._pb.authedClient.collection('accounts').unsubscribe();
		this._pb.authedClient.collection('accountBalances').unsubscribe();
	}
}

export const CONTEXT_KEY_ACCOUNTS = 'accounts';

export function setAccountsContext(
	pb: PocketBaseContext,
	balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
) {
	return setContext(CONTEXT_KEY_ACCOUNTS, new AccountsContext(pb, balanceTypesContext));
}

export function getAccountsContext() {
	return getContext<ReturnType<typeof setAccountsContext>>(CONTEXT_KEY_ACCOUNTS);
}
