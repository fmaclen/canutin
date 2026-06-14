import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { setBalanceTypesContext } from './balance-types.svelte';
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

const DEBOUNCE_MS = 200;

class AccountsContext {
	accounts: AccountWithBalance[] = $derived.by(() =>
		this.rawAccounts.map(({ record, cashBalance, balanceAsOf }) => {
			const positions = this.positionsSource?.positionsValueByAccount;
			const positionsValue = positions && positions.has(record.id) ? positions.get(record.id)! : 0;
			return this.toAccountWithBalance(record, cashBalance, positionsValue, balanceAsOf);
		})
	);
	get accountRecords(): AccountsResponse[] {
		return this.rawAccounts.map(({ record }) => record);
	}
	shares: AccountSharesResponse[] = $state([]);
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private rawAccounts: { record: AccountsResponse; cashBalance: number; balanceAsOf: string }[] =
		$state([]);
	private positionsSource: PositionsSource | null = $state(null);
	private accountsLoaded = false;
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private refreshSequence = 0;

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
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		await this._pb.authedClient.collection('accountShares').update(shareId, { includeInNetWorth });
		await this.refreshShares();
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
				this.refreshSequence++;
				if (this.refreshTimer) clearTimeout(this.refreshTimer);
				this.refreshTimer = null;
				this.rawAccounts = [];
				this.shares = [];
				this.accountsLoaded = false;
				this.lastBalanceEvent = 0;
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.accountsLoaded = false;
			this.lastBalanceEvent = 0;
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
		const [accounts, accountBalances] = await Promise.all([
			this._pb.authedClient.collection('accounts').getFullList<AccountsResponse>({
				filter: `owner='${userId}' || accountShares_via_account.recipient ?= '${userId}'`,
				requestKey: null
			}),
			this._pb.authedClient.collection('accountBalances').getFullList<AccountBalancesResponse>({
				sort: 'account,-asOf,-created,-id',
				requestKey: null
			})
		]);
		for (const account of accounts) {
			await this.balanceTypesContext.ensureLoaded(account.balanceType);
		}
		if (userId !== this.currentUserId || token !== this.refreshSequence) return;

		const latestCashByAccount = new SvelteMap<string, AccountBalancesResponse>();
		for (const balance of accountBalances) {
			if (!latestCashByAccount.has(balance.account)) {
				latestCashByAccount.set(balance.account, balance);
			}
		}
		this.rawAccounts = accounts.map((record) => {
			const cash = latestCashByAccount.get(record.id);
			return { record, cashBalance: cash?.value ?? 0, balanceAsOf: cash?.asOf ?? '' };
		});
		this.accountsLoaded = true;
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('accounts')
			.subscribe('*', this.onCollectionEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_accounts'));
		this._pb.authedClient
			.collection('accountBalances')
			.subscribe('*', this.onCollectionEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_balances'));
		this._pb.authedClient
			.collection('accountShares')
			.subscribe('*', this.onAccountShareEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_shares'));
	}

	private onCollectionEvent(
		e: RecordSubscription<AccountsResponse> | RecordSubscription<AccountBalancesResponse>
	) {
		if (!e.action) return;
		this.scheduleRefresh();
	}

	private onAccountShareEvent(e: RecordSubscription<AccountSharesResponse>) {
		const userId = this.currentUserId;
		if (!userId) return;
		const isRelevantShare = e.record.grantedBy === userId || e.record.recipient === userId;
		if (e.action === 'create') {
			if (isRelevantShare) this.shares = [...this.shares, e.record];
		} else if (e.action === 'update') {
			if (isRelevantShare)
				this.shares = this.shares.map((share) => (share.id === e.record.id ? e.record : share));
		} else if (e.action === 'delete') {
			this.shares = this.shares.filter((share) => share.id !== e.record.id);
		}

		this.scheduleRefresh();
	}

	private scheduleRefresh() {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		const userId = this.currentUserId;
		if (!userId) return;
		const token = ++this.refreshSequence;
		this.refreshTimer = setTimeout(async () => {
			this.refreshTimer = null;
			try {
				await this.refreshShares(userId, token);
				await this.refreshAccounts(userId, token);
				this.notifyBalancesChanged();
			} catch (error) {
				if (userId !== this.currentUserId || token !== this.refreshSequence) return;
				this._pb.handleConnectionError(error, 'accounts', 'refresh');
			}
		}, DEBOUNCE_MS);
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
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this._pb.authedClient.collection('accounts').unsubscribe('*');
		this._pb.authedClient.collection('accountBalances').unsubscribe('*');
		this._pb.authedClient.collection('accountShares').unsubscribe('*');
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
