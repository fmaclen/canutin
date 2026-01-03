import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { setBalanceTypesContext } from './balance-types.svelte';
import type { AccountBalancesResponse, AccountsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

type AccountWithBalance = AccountsResponse & { balance: number; balanceAsOf: string };

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

	async deleteAccount(id: string) {
		await this._pb.authedClient.collection('accounts').delete(id);
	}

	private async init() {
		try {
			// Subscribe FIRST to avoid missing events during initial fetch
			this.realtimeSubscribe();

			const list = await this._pb.authedClient
				.collection('accounts')
				.getFullList<AccountsResponse>();
			this.accounts = list.map((a) => ({ ...a, balance: 0, balanceAsOf: '' }));
			for (const a of this.accounts) {
				const balanceData = await this.getLatestAccountBalance(a.id);
				this.accounts = this.accounts.map((x) =>
					x.id === a.id ? { ...x, balance: balanceData.value, balanceAsOf: balanceData.asOf } : x
				);
			}
			this.lastBalanceEvent = Date.now();
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
			this.accounts = [...this.accounts, { ...e.record, balance: 0, balanceAsOf: '' }];
		} else if (e.action === 'update') {
			const existing = this.accounts.find((a) => a.id === e.record.id);
			const balance = existing?.balance ?? 0;
			const balanceAsOf = existing?.balanceAsOf ?? '';
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.accounts = this.accounts.map((x) =>
				x.id === e.record.id ? { ...e.record, balance, balanceAsOf } : x
			);
		} else if (e.action === 'delete') {
			this.accounts = this.accounts.filter((x) => x.id !== e.record.id);
		}
	}

	private onAccountBalanceEvent(e: RecordSubscription<AccountBalancesResponse>) {
		if (!e.action) return;
		const accountId = e.record.account;
		const newAsOf = e.record.asOf;
		const newValue = e.record.value ?? 0;

		if (e.action === 'create' || e.action === 'update') {
			// Optimistic update: use the value from the event directly.
			// If account isn't loaded yet (event arrived during initial fetch), we ignore it.
			// This is safe because init() fetches the latest balance for each account after loading.
			const account = this.accounts.find((x) => x.id === accountId);
			if (!account) return;

			// Only update if this balance is newer than what we have
			if (!account.balanceAsOf || newAsOf >= account.balanceAsOf) {
				this.accounts = this.accounts.map((x) =>
					x.id === accountId ? { ...x, balance: newValue, balanceAsOf: newAsOf } : x
				);
				this.lastBalanceEvent = Date.now();
			}
		} else if (e.action === 'delete') {
			// When a balance is deleted, we need to re-fetch to get the next most recent
			this.refetchAccountBalance(accountId);
		}
	}

	private async refetchAccountBalance(accountId: string) {
		try {
			const balanceData = await this.getLatestAccountBalance(accountId);
			this.accounts = this.accounts.map((x) =>
				x.id === accountId ? { ...x, balance: balanceData.value, balanceAsOf: balanceData.asOf } : x
			);
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			console.error('[accounts:refetch_balance]', error);
		}
	}

	private async getLatestAccountBalance(accountId: string) {
		const res = await this._pb.authedClient
			.collection('accountBalances')
			.getList<AccountBalancesResponse>(1, 1, {
				filter: `account='${accountId}'`,
				sort: '-asOf,-created,-id'
			});
		const item = res.items[0];
		return { value: item?.value ?? 0, asOf: item?.asOf ?? '' };
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
