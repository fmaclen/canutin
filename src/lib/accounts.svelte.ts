import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { setBalanceTypesContext } from './balance-types.svelte';
import { logError } from './logger';
import {
	AccountSharesAccessRoleOptions,
	AccountSharesPerspectiveOptions,
	type AccountBalancesResponse,
	type AccountSharesResponse,
	type AccountsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { sumOrUnknown } from './security-balance-values';
import { participantExcluded, projectSignedValue } from './sharing';

export type AccountWithBalance = AccountsResponse & {
	balance: number | null;
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

type PositionsSource = {
	positionsValueByAccount: ReadonlyMap<string, number | null>;
	positionsLoaded: boolean;
};

type LatestAccountBalance = {
	id: string;
	account: string;
	value: number;
	asOf: string;
	created: string;
};

class AccountsContext {
	accounts: AccountWithBalance[] = $derived.by(() =>
		this.rawAccounts.map((record) => {
			const cash = this.latestCashByAccount.get(record.id);
			const positions = this.positionsSource?.positionsValueByAccount;
			const positionsValue = positions && positions.has(record.id) ? positions.get(record.id)! : 0;
			return this.toAccountWithBalance(record, cash?.value ?? 0, positionsValue, cash?.asOf ?? '');
		})
	);
	get accountRecords(): AccountsResponse[] {
		return this.rawAccounts;
	}
	shares: AccountSharesResponse[] = $state([]);
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private rawAccounts: AccountsResponse[] = $state([]);
	private latestCashByAccount = new SvelteMap<string, LatestAccountBalance>();
	private positionsSource: PositionsSource | null = $state(null);
	private accountsLoaded = false;
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;
	private refreshSequence = 0;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(
		pb: PocketBaseContext,
		balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
	) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this.balanceTypesContext = balanceTypesContext;
		this.init();
	}

	private get currentUserId() {
		return this._auth.currentUserId;
	}

	connectPositions(source: PositionsSource) {
		this.positionsSource = source;
	}

	notifyBalancesChanged() {
		if (
			this.lastBalanceEvent === 0 &&
			!(this.accountsLoaded && this.positionsSource?.positionsLoaded)
		) {
			return;
		}
		this.lastBalanceEvent = Date.now();
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
		if (await this.refreshAccount(accountId, this.currentUserId)) this.notifyBalancesChanged();
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		const share = await this._pb.authedClient
			.collection('accountShares')
			.update<AccountSharesResponse>(shareId, { includeInNetWorth });
		await this.refreshShares();
		if (await this.refreshAccount(share.account, this.currentUserId)) this.notifyBalancesChanged();
	}

	async revokeShare(shareId: string) {
		const accountId = this.shares.find((share) => share.id === shareId)?.account;
		await this._pb.authedClient.collection('accountShares').delete(shareId);
		await this.refreshShares();
		if (accountId && (await this.refreshAccount(accountId, this.currentUserId))) {
			this.notifyBalancesChanged();
		}
	}

	private init() {
		$effect(() => {
			const userId = this.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._activeUserId = userId;
			if (!userId) {
				this.refreshSequence++;
				this.rawAccounts = [];
				this.latestCashByAccount.clear();
				this.shares = [];
				this.accountsLoaded = false;
				this.lastBalanceEvent = 0;
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.accountsLoaded = false;
			this.lastBalanceEvent = 0;
			this.realtimeSubscribe(userId);
			void this.refreshForCurrentUser();
		});
	}

	private async refreshForCurrentUser() {
		const userId = this.currentUserId;
		const token = ++this.refreshSequence;
		try {
			await this.refreshShares(userId, token);
			await this.refreshAccounts(userId, token);
			this.notifyBalancesChanged();
		} catch (error) {
			if (userId !== this.currentUserId || token !== this.refreshSequence) return;
			this._pb.handleConnectionError(error, 'accounts', 'init');
		} finally {
			if (userId === this.currentUserId && token === this.refreshSequence) this.isLoading = false;
		}
	}

	private async refreshShares(userId = this.currentUserId, token = this.refreshSequence) {
		if (!userId || userId !== this.currentUserId || token !== this.refreshSequence) return;
		const shares = await this._pb.authedClient.collection('accountShares').getFullList({
			filter: `grantedBy='${userId}' || recipient='${userId}'`,
			sort: 'recipientEmail',
			requestKey: null
		});
		if (userId !== this.currentUserId || token !== this.refreshSequence) return;
		this.shares = shares;
	}

	private async refreshAccounts(userId = this.currentUserId, token = this.refreshSequence) {
		if (!userId || userId !== this.currentUserId || token !== this.refreshSequence) return;
		const accounts = await this._pb.authedClient
			.collection('accounts')
			.getFullList<AccountsResponse>({
				filter: `owner='${userId}' || accountShares_via_account.recipient ?= '${userId}'`,
				requestKey: null
			});
		for (const account of accounts) {
			await this.balanceTypesContext.ensureLoaded(account.balanceType);
		}
		const latestBalances = await Promise.all(
			accounts.map((account) => this.getLatestAccountBalance(account.id))
		);
		if (userId !== this.currentUserId || token !== this.refreshSequence) return;

		this.latestCashByAccount.clear();
		for (const balance of latestBalances) {
			if (balance) this.latestCashByAccount.set(balance.account, balance);
		}
		this.rawAccounts = accounts;
		this.accountsLoaded = true;
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('accounts')
			.subscribe<AccountsResponse>('*', (event) => {
				void this.onCollectionEvent(event, userId).catch((error) => {
					if (userId === this._activeUserId) {
						this._pb.handleConnectionError(error, 'accounts', 'account_event');
					}
				});
			})
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_accounts');
				} else {
					logError('accountsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('accountBalances')
			.subscribe<AccountBalancesResponse>('*', (event) => {
				void this.onCollectionEvent(event, userId).catch((error) => {
					if (userId === this._activeUserId) {
						this._pb.handleConnectionError(error, 'accounts', 'balance_event');
					}
				});
			})
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_balances');
				} else {
					logError('accountsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('accountShares')
			.subscribe<AccountSharesResponse>('*', (event) => this.onAccountShareEvent(event, userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_shares');
				} else {
					logError('accountsStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('accounts').unsubscribe('*');
		this._pb.authedClient.collection('accountBalances').unsubscribe('*');
		this._pb.authedClient.collection('accountShares').unsubscribe('*');
	}

	private async onCollectionEvent(
		e: RecordSubscription<AccountsResponse> | RecordSubscription<AccountBalancesResponse>,
		userId: string
	) {
		if (!userId || userId !== this._activeUserId) return;
		if (!e.action) return;
		if ('account' in e.record) {
			await this.onAccountBalanceEvent(e.action, e.record, userId);
			return;
		}
		await this.onAccountEvent(e.action, e.record, userId);
	}

	private onAccountShareEvent(e: RecordSubscription<AccountSharesResponse>, userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		const isRelevantShare = e.record.grantedBy === userId || e.record.recipient === userId;
		if (e.action === 'create') {
			if (isRelevantShare) this.shares = [...this.shares, e.record];
		} else if (e.action === 'update') {
			if (isRelevantShare)
				this.shares = this.shares.map((share) => (share.id === e.record.id ? e.record : share));
		} else if (e.action === 'delete') {
			this.shares = this.shares.filter((share) => share.id !== e.record.id);
		}

		void this.refreshAccount(e.record.account, userId)
			.then(() => this.notifyBalancesChanged())
			.catch((error) => {
				if (userId === this.currentUserId)
					this._pb.handleConnectionError(error, 'accounts', 'share');
			});
	}

	private async onAccountEvent(action: string, account: AccountsResponse, userId: string) {
		if (action === 'delete') {
			this.rawAccounts = this.rawAccounts.filter((record) => record.id !== account.id);
			this.latestCashByAccount.delete(account.id);
			this.notifyBalancesChanged();
			return;
		}

		await this.balanceTypesContext.ensureLoaded(account.balanceType);
		if (userId !== this.currentUserId) return;
		const exists = this.rawAccounts.some((record) => record.id === account.id);
		this.rawAccounts = exists
			? this.rawAccounts.map((record) => (record.id === account.id ? account : record))
			: [...this.rawAccounts, account];
		if (!this.latestCashByAccount.has(account.id)) {
			await this.refreshAccountBalance(account.id, userId);
		}
		this.notifyBalancesChanged();
	}

	private async onAccountBalanceEvent(
		action: string,
		balance: AccountBalancesResponse,
		userId: string
	) {
		const accountId = balance.account;
		let previousAccountId: string | null = null;
		for (const [key, currentBalance] of this.latestCashByAccount) {
			if (currentBalance.id === balance.id) {
				previousAccountId = key;
				break;
			}
		}
		if (previousAccountId && previousAccountId !== accountId) {
			await this.refreshAccountBalance(previousAccountId, userId);
		}

		if (!this.rawAccounts.some((account) => account.id === accountId)) {
			await this.refreshAccount(accountId, userId);
			this.notifyBalancesChanged();
			return;
		}

		const current = this.latestCashByAccount.get(accountId);
		if (action === 'delete' || current?.id === balance.id) {
			await this.refreshAccountBalance(accountId, userId);
			this.notifyBalancesChanged();
			return;
		}

		if (!current || this.isAtLeastAsRecent(balance, current)) {
			this.latestCashByAccount.set(accountId, this.toLatestAccountBalance(balance));
			this.notifyBalancesChanged();
		}
	}

	async refreshAccount(accountId: string, userId: string) {
		if (!userId || userId !== this.currentUserId) return false;
		try {
			const account = await this._pb.authedClient
				.collection('accounts')
				.getOne<AccountsResponse>(accountId, { requestKey: null });
			await this.balanceTypesContext.ensureLoaded(account.balanceType);
			const balance = await this.getLatestAccountBalance(accountId);
			if (userId !== this.currentUserId) return false;
			const exists = this.rawAccounts.some((record) => record.id === account.id);
			this.rawAccounts = exists
				? this.rawAccounts.map((record) => (record.id === account.id ? account : record))
				: [...this.rawAccounts, account];
			if (balance) this.latestCashByAccount.set(accountId, balance);
			else this.latestCashByAccount.delete(accountId);
			return true;
		} catch (error) {
			if (this.isUnavailableRecordError(error)) {
				this.rawAccounts = this.rawAccounts.filter((account) => account.id !== accountId);
				this.latestCashByAccount.delete(accountId);
				return true;
			}
			throw error;
		}
	}

	private async refreshAccountBalance(accountId: string, userId: string) {
		const balanceBeforeRefresh = this.latestCashByAccount.get(accountId);
		const balance = await this.getLatestAccountBalance(accountId);
		if (userId !== this.currentUserId) return false;
		if (balance) this.latestCashByAccount.set(accountId, balance);
		else if (
			balanceBeforeRefresh &&
			this.latestCashByAccount.get(accountId)?.id === balanceBeforeRefresh.id
		) {
			this.latestCashByAccount.delete(accountId);
		}
		return true;
	}

	private async getLatestAccountBalance(accountId: string) {
		const res = await this._pb.authedClient
			.collection('accountBalances')
			.getList<AccountBalancesResponse>(1, 1, {
				filter: `account='${accountId}'`,
				sort: '-asOf,-created,-id',
				requestKey: null
			});
		const balance = res.items[0];
		return balance ? this.toLatestAccountBalance(balance) : null;
	}

	private toLatestAccountBalance(balance: AccountBalancesResponse) {
		return {
			id: balance.id,
			account: balance.account,
			value: balance.value ?? 0,
			asOf: balance.asOf,
			created: balance.created
		};
	}

	private isAtLeastAsRecent(
		balance: Pick<AccountBalancesResponse, 'asOf' | 'created' | 'id'>,
		current: Pick<LatestAccountBalance, 'asOf' | 'created' | 'id'>
	) {
		if (balance.asOf !== current.asOf) return balance.asOf > current.asOf;
		if (balance.created !== current.created) return balance.created > current.created;
		return balance.id >= current.id;
	}

	private isUnavailableRecordError(error: unknown) {
		return (
			typeof error === 'object' &&
			error !== null &&
			'status' in error &&
			(error.status === 403 || error.status === 404)
		);
	}

	private toAccountWithBalance(
		account: AccountsResponse,
		rawCashBalance: number,
		rawSecurityBalance: number | null,
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

		const rawBalance = sumOrUnknown([rawCashBalance, rawSecurityBalance]);
		return {
			...account,
			balance: projectSignedValue(rawBalance, perspective),
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

	dispose() {
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this.unsubscribeRealtime();
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
