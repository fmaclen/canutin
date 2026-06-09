import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { setBalanceTypesContext } from './balance-types.svelte';
import {
	AccountSharesAccessRoleOptions,
	AccountSharesPerspectiveOptions,
	type AccountBalancesResponse,
	type AccountSharesResponse,
	type AccountsResponse,
	type SecurityBalancesResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { participantExcluded, projectSignedValue } from './sharing';

type SecurityBalance = SecurityBalancesResponse<number, number, number, number>;

export type AccountWithBalance = AccountsResponse & {
	balance: number;
	cashBalance: number;
	balanceAsOf: string;
	isOwner: boolean;
	canWrite: boolean;
	accessRole: 'OWNER' | AccountSharesAccessRoleOptions;
	perspective: AccountSharesPerspectiveOptions;
	participantExcluded: boolean;
	incomingShareId: string | null;
	isShared: boolean;
};

class AccountsContext {
	accounts: AccountWithBalance[] = $state([]);
	shares: AccountSharesResponse[] = $state([]);
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;

	constructor(
		pb: PocketBaseContext,
		balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
	) {
		this._pb = pb;
		this._auth = getAuthContext();
		this.balanceTypesContext = balanceTypesContext;
		this.init();
	}

	private get currentUserId() {
		return this._auth.currentUserId;
	}

	getTypeName(id: string) {
		return this.balanceTypesContext.getName(id);
	}

	getAccount(id: string): AccountWithBalance | undefined {
		return this.accounts.find((a) => a.id === id);
	}

	getIncomingShare(accountId: string) {
		return this.shares.find(
			(share) => share.account === accountId && share.recipient === this.currentUserId
		);
	}

	getGrantedShares(accountId: string) {
		return this.shares
			.filter((share) => share.account === accountId && share.grantedBy === this.currentUserId)
			.sort((a, b) => a.recipientEmail.localeCompare(b.recipientEmail));
	}

	async deleteAccount(id: string) {
		await this._pb.authedClient.collection('accounts').delete(id);
	}

	async createShare(
		accountId: string,
		recipientEmail: string,
		perspective: AccountSharesPerspectiveOptions
	) {
		await this._pb.postJson('/api/shares/accounts', {
			accountId,
			recipientEmail,
			perspective
		});
		await this.refreshShares();
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		await this._pb.authedClient.collection('accountShares').update(shareId, { includeInNetWorth });
		await this.refreshShares();
		await this.refreshAccounts();
	}

	async revokeShare(shareId: string) {
		await this._pb.authedClient.collection('accountShares').delete(shareId);
		await this.refreshShares();
	}

	private init() {
		this.realtimeSubscribe();
		$effect(() => {
			const userId = this.currentUserId;
			if (!userId) {
				this.accounts = [];
				this.shares = [];
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			void this.refreshForCurrentUser();
		});
	}

	private async refreshForCurrentUser() {
		try {
			await this.refreshShares();
			await this.refreshAccounts();
			this.lastBalanceEvent = Date.now();
		} catch (error) {
			this._pb.handleConnectionError(error, 'accounts', 'init');
		} finally {
			this.isLoading = false;
		}
	}

	private async refreshShares() {
		const userId = this.currentUserId;
		this.shares = await this._pb.authedClient.collection('accountShares').getFullList({
			filter: `grantedBy='${userId}' || recipient='${userId}'`,
			sort: 'recipientEmail',
			requestKey: null
		});
	}

	private async refreshAccounts() {
		const userId = this.currentUserId;
		const list = await this._pb.authedClient.collection('accounts').getFullList<AccountsResponse>({
			filter: `owner='${userId}' || accountShares_via_account.recipient ?= '${userId}'`,
			requestKey: null
		});
		const accountBalances = await Promise.all(
			list.map((account) => this.getLatestAccountBalance(account.id))
		);
		const securityBalanceTotals = await this.getLatestSecurityBalanceTotals(
			list.map((account) => account.id)
		);
		const next: AccountWithBalance[] = [];
		for (const [index, account] of list.entries()) {
			await this.balanceTypesContext.ensureLoaded(account.balanceType);
			const balanceData = accountBalances[index];
			next.push(
				this.toAccountWithBalance(
					account,
					balanceData.value,
					securityBalanceTotals.get(account.id) ?? 0,
					balanceData.asOf
				)
			);
		}
		this.accounts = next;
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
		this._pb.authedClient
			.collection('securityBalances')
			.subscribe('*', this.onSecurityBalanceEvent.bind(this))
			.catch((error) =>
				this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_security_balances')
			);
		this._pb.authedClient
			.collection('accountShares')
			.subscribe('*', this.onAccountShareEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_shares'));
	}

	private async onAccountEvent(e: RecordSubscription<AccountsResponse>) {
		if (!e.action) return;
		await this.refreshAccounts();
		this.lastBalanceEvent = Date.now();
	}

	private onAccountBalanceEvent(e: RecordSubscription<AccountBalancesResponse>) {
		if (!e.action) return;
		void this.refreshAccounts().then(() => {
			this.lastBalanceEvent = Date.now();
		});
	}

	private onSecurityBalanceEvent(e: RecordSubscription<SecurityBalance>) {
		if (!e.action) return;
		void this.refreshAccounts().then(() => {
			this.lastBalanceEvent = Date.now();
		});
	}

	private async onAccountShareEvent(e: RecordSubscription<AccountSharesResponse>) {
		if (e.action === 'create') {
			this.shares = [...this.shares, e.record];
		} else if (e.action === 'update') {
			this.shares = this.shares.map((share) => (share.id === e.record.id ? e.record : share));
		} else if (e.action === 'delete') {
			this.shares = this.shares.filter((share) => share.id !== e.record.id);
		}

		await this.refreshAccounts();
		this.lastBalanceEvent = Date.now();
	}

	private toAccountWithBalance(
		account: AccountsResponse,
		rawCashBalance: number,
		rawSecurityBalance: number,
		balanceAsOf: string
	): AccountWithBalance {
		const incomingShare = this.getIncomingShare(account.id);
		const isOwner = account.owner === this.currentUserId;
		const perspective = isOwner
			? AccountSharesPerspectiveOptions.NORMAL
			: (incomingShare?.perspective ?? AccountSharesPerspectiveOptions.NORMAL);
		const accessRole: AccountWithBalance['accessRole'] = isOwner
			? 'OWNER'
			: (incomingShare?.accessRole ?? AccountSharesAccessRoleOptions.VIEWER);
		const grantedShares = this.getGrantedShares(account.id);
		const isShared = !isOwner || grantedShares.length > 0;

		return {
			...account,
			balance: projectSignedValue(rawCashBalance + rawSecurityBalance, perspective),
			cashBalance: projectSignedValue(rawCashBalance, perspective),
			balanceAsOf,
			isOwner,
			canWrite: isOwner,
			accessRole,
			perspective,
			participantExcluded: participantExcluded(
				isOwner,
				Boolean(account.excluded),
				incomingShare?.includeInNetWorth
			),
			incomingShareId: incomingShare?.id ?? null,
			isShared
		};
	}

	private async getLatestAccountBalance(accountId: string) {
		const res = await this._pb.authedClient
			.collection('accountBalances')
			.getList<AccountBalancesResponse>(1, 1, {
				filter: `account='${accountId}'`,
				sort: '-asOf,-created,-id',
				requestKey: null
			});
		const item = res.items[0];
		return { value: item?.value ?? 0, asOf: item?.asOf ?? '' };
	}

	private async getLatestSecurityBalanceTotals(accountIds: string[]) {
		const accountIdSet = new SvelteSet(accountIds);
		const totals = new SvelteMap<string, number>();
		if (accountIdSet.size === 0) return totals;

		const balances = await this._pb.authedClient
			.collection('securityBalances')
			.getFullList<SecurityBalance>({
				sort: 'account,security,-asOf,-created,-id',
				requestKey: null
			});
		const seen = new SvelteSet<string>();
		for (const balance of balances) {
			if (!accountIdSet.has(balance.account)) continue;
			const key = `${balance.account}:${balance.security}`;
			if (seen.has(key)) continue;
			seen.add(key);
			totals.set(
				balance.account,
				(totals.get(balance.account) ?? 0) + this.toNumber(balance.value)
			);
		}
		return totals;
	}

	private toNumber(value: number | string | null | undefined) {
		if (value === null || value === undefined || value === '') return 0;
		const numberValue = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numberValue) ? numberValue : 0;
	}

	dispose() {
		this._pb.authedClient.collection('accounts').unsubscribe();
		this._pb.authedClient.collection('accountBalances').unsubscribe();
		this._pb.authedClient.collection('securityBalances').unsubscribe('*');
		this._pb.authedClient.collection('accountShares').unsubscribe();
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
