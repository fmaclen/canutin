import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { setBalanceTypesContext } from './balance-types.svelte';
import {
	AccountSharesAccessRoleOptions,
	AccountSharesPerspectiveOptions,
	type AccountBalancesResponse,
	type AccountSharesResponse,
	type AccountsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { participantExcluded, projectSignedValue } from './sharing';

export type AccountWithBalance = AccountsResponse & {
	balance: number;
	balanceAsOf: string;
	isOwner: boolean;
	canWrite: boolean;
	accessRole: 'OWNER' | AccountSharesAccessRoleOptions;
	perspective: AccountSharesPerspectiveOptions;
	participantExcluded: boolean;
	incomingShareId: string | null;
};

class AccountsContext {
	accounts: AccountWithBalance[] = $state([]);
	shares: AccountSharesResponse[] = $state([]);
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

	private get currentUserId() {
		return this._pb.authedClient.authStore.record?.id ?? '';
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

	private async init() {
		try {
			this.realtimeSubscribe();
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
		this.shares = await this._pb.authedClient.collection('accountShares').getFullList({
			sort: 'recipientEmail',
			requestKey: null
		});
	}

	private async refreshAccounts() {
		const list = await this._pb.authedClient.collection('accounts').getFullList<AccountsResponse>({
			requestKey: null
		});
		const next: AccountWithBalance[] = [];
		for (const account of list) {
			await this.balanceTypesContext.ensureLoaded(account.balanceType);
			const balanceData = await this.getLatestAccountBalance(account.id);
			next.push(this.toAccountWithBalance(account, balanceData.value, balanceData.asOf));
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
			.collection('accountShares')
			.subscribe('*', this.onAccountShareEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_shares'));
	}

	private async onAccountEvent(e: RecordSubscription<AccountsResponse>) {
		if (e.action === 'create') {
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			const balanceData = await this.getLatestAccountBalance(e.record.id);
			this.accounts = [
				...this.accounts,
				this.toAccountWithBalance(e.record, balanceData.value, balanceData.asOf)
			];
		} else if (e.action === 'update') {
			const existing = this.accounts.find((a) => a.id === e.record.id);
			const balance = existing
				? projectSignedValue(existing.balance, existing.perspective)
				: (await this.getLatestAccountBalance(e.record.id)).value;
			const balanceAsOf = existing?.balanceAsOf ?? '';
			await this.balanceTypesContext.ensureLoaded(e.record.balanceType);
			this.accounts = this.accounts.map((x) =>
				x.id === e.record.id ? this.toAccountWithBalance(e.record, balance, balanceAsOf) : x
			);
		} else if (e.action === 'delete') {
			this.accounts = this.accounts.filter((x) => x.id !== e.record.id);
		}
	}

	private onAccountBalanceEvent(e: RecordSubscription<AccountBalancesResponse>) {
		if (!e.action) return;
		const accountId = e.record.account;
		const newAsOf = e.record.asOf;
		const rawValue = e.record.value ?? 0;

		if (e.action === 'create' || e.action === 'update') {
			const account = this.accounts.find((x) => x.id === accountId);
			if (!account) {
				void this.refreshAccounts().then(() => {
					this.lastBalanceEvent = Date.now();
				});
				return;
			}

			if (!account.balanceAsOf || newAsOf >= account.balanceAsOf) {
				this.accounts = this.accounts.map((x) =>
					x.id === accountId
						? {
								...x,
								balance: projectSignedValue(rawValue, x.perspective),
								balanceAsOf: newAsOf
							}
						: x
				);
				this.lastBalanceEvent = Date.now();
			}
		} else if (e.action === 'delete') {
			void this.refetchAccountBalance(accountId);
		}
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
		rawBalance: number,
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

		return {
			...account,
			balance: projectSignedValue(rawBalance, perspective),
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
			incomingShareId: incomingShare?.id ?? null
		};
	}

	private async refetchAccountBalance(accountId: string) {
		try {
			const balanceData = await this.getLatestAccountBalance(accountId);
			this.accounts = this.accounts.map((x) =>
				x.id === accountId
					? {
							...x,
							balance: projectSignedValue(balanceData.value, x.perspective),
							balanceAsOf: balanceData.asOf
						}
					: x
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
