import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { setBalanceTypesContext } from './balance-types.svelte';
import { getExchangeRatesContext } from './exchange-rates.svelte';
import { logError } from './logger';
import {
	AccountSharesAccessRoleOptions,
	AccountSharesPerspectiveOptions,
	type AccountBalancesResponse,
	type AccountSharesResponse,
	type AccountsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';
import type { AccountPositionsValue } from './securities.svelte';
import { sumOrUnknown } from './security-balance-values';
import { participantExcluded, projectSignedValue } from './sharing';
import { toPocketBaseDateString } from './utils';

export type AccountWithBalance = AccountsResponse & {
	// NOTE: `balance` is the perspective-projected total in the account's own currency (null when
	// foreign-currency securities make a single native figure ambiguous); `displayBalance` sums the
	// cash and each security position converted to the display currency at each one's own date.
	balance: number | null;
	displayBalance: number | null;
	isConverted: boolean;
	isUnconverted: boolean;
	missingCurrency: string | null;
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
	positionsValueByAccount: ReadonlyMap<string, AccountPositionsValue>;
	positionsLoaded: boolean;
};

type LatestCash = {
	value: number;
	asOf: string;
};

const DEBOUNCE_MS = 200;

class AccountsContext {
	accounts: AccountWithBalance[] = $derived.by(() =>
		this.rawAccounts.map((record) => {
			const cash = this.latestCashByAccount.get(record.id);
			const positions = this.positionsSource?.positionsValueByAccount.get(record.id) ?? {
				value: 0,
				nativeValue: 0,
				isConverted: false,
				isUnconverted: false,
				missingCurrency: null
			};
			return this.toAccountWithBalance(record, cash?.value ?? 0, positions, cash?.asOf ?? '');
		})
	);
	get accountRecords(): AccountsResponse[] {
		return this.rawAccounts;
	}
	shares: AccountSharesResponse[] = $state([]);
	lastBalanceEvent: number = $state(0);
	isLoading: boolean = $state(true);

	private rawAccounts: AccountsResponse[] = $state([]);
	private latestCashByAccount = new SvelteMap<string, LatestCash>();
	private positionsSource: PositionsSource | null = $state(null);
	private accountsLoaded = false;
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _fx: ReturnType<typeof getExchangeRatesContext>;
	private balanceTypesContext: ReturnType<typeof setBalanceTypesContext>;
	private sequence = new RequestSequence();
	private debouncer = new Debouncer(DEBOUNCE_MS);
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _reconnectCallback = () => this.invalidate();

	constructor(
		pb: PocketBaseContext,
		balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
	) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._pb.registerRealtimeReconnect(this._reconnectCallback);
		this._fx = getExchangeRatesContext();
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
		await this.refreshForCurrentUser();
	}

	async updateShareIncludeInNetWorth(shareId: string, includeInNetWorth: boolean) {
		await this._pb.authedClient.collection('accountShares').update(shareId, { includeInNetWorth });
		await this.refreshForCurrentUser();
	}

	async revokeShare(shareId: string) {
		await this._pb.authedClient.collection('accountShares').delete(shareId);
		await this.refreshForCurrentUser();
	}

	private init() {
		$effect(() => {
			const userId = this.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.debouncer.cancel();
			this.sequence.bump();
			this._activeUserId = userId;
			if (!userId) {
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

	// Realtime events and reconnects are pure invalidation signals: they never patch a payload into
	// state, they only schedule a full refetch. Deletes, share membership changes, and cross-account
	// balance reassignments all resolve for free because the fresh snapshot reflects the database as-is.
	private invalidate() {
		this.debouncer.schedule(() => void this.refreshForCurrentUser());
	}

	async refreshForCurrentUser() {
		const userId = this.currentUserId;
		const token = this.sequence.next();
		try {
			const [shares, accounts, balances] = await Promise.all([
				this._pb.authedClient.collection('accountShares').getFullList<AccountSharesResponse>({
					filter: `grantedBy='${userId}' || recipient='${userId}'`,
					sort: 'recipientEmail',
					requestKey: null
				}),
				this._pb.authedClient.collection('accounts').getFullList<AccountsResponse>({
					filter: `owner='${userId}' || accountShares_via_account.recipient ?= '${userId}'`,
					requestKey: null
				}),
				// One query for every account's latest balance instead of N point-queries: the
				// 'account,-asOf,-created,-id' sort groups by account and orders each group newest-first,
				// so the first row seen per account wins - the same tiebreakers getList(1,1) used.
				this._pb.authedClient.collection('accountBalances').getFullList<AccountBalancesResponse>({
					sort: 'account,-asOf,-created,-id',
					fields: 'account,value,asOf',
					requestKey: null
				})
			]);
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;
			for (const account of accounts) {
				await this.balanceTypesContext.ensureLoaded(account.balanceType);
			}
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;

			this.shares = shares.toSorted((a, b) => a.recipientEmail.localeCompare(b.recipientEmail));
			this.latestCashByAccount.clear();
			for (const balance of balances) {
				if (this.latestCashByAccount.has(balance.account)) continue;
				this.latestCashByAccount.set(balance.account, {
					value: balance.value ?? 0,
					asOf: balance.asOf
				});
			}
			this.rawAccounts = accounts;
			this.accountsLoaded = true;
			this.notifyBalancesChanged();
		} catch (error) {
			if (userId !== this.currentUserId || !this.sequence.isCurrent(token)) return;
			this._pb.handleConnectionError(error, 'accounts', 'refresh');
		} finally {
			if (userId === this.currentUserId && this.sequence.isCurrent(token)) this.isLoading = false;
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('accounts')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_accounts');
				} else {
					logError('accountsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('accountBalances')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_balances');
				} else {
					logError('accountsStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('accountShares')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accounts', 'subscribe_shares');
				} else {
					logError('accountsStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private onRealtimeEvent(userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		this.invalidate();
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('accounts').unsubscribe('*');
		this._pb.authedClient.collection('accountBalances').unsubscribe('*');
		this._pb.authedClient.collection('accountShares').unsubscribe('*');
	}

	private toAccountWithBalance(
		account: AccountsResponse,
		rawCashBalance: number,
		positions: AccountPositionsValue,
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

		// NOTE: positions.value is already in the display currency (each position converted at its
		// own currency/date in securities.svelte.ts), so only cash is converted here and the two
		// display amounts are summed - converting positions.value again would double-convert it.
		// NOTE: falls back to now when there's no dated balance yet (e.g. a positions-only
		// account with no cash snapshot), so the row still converts at a sensible rate.
		const conversionDate = balanceAsOf || toPocketBaseDateString(new Date());
		const cashConversion = this._fx.convert(rawCashBalance, account.currency, conversionDate);
		const displayCashBalance = cashConversion.isUnconverted ? 0 : cashConversion.value;
		const balance = projectSignedValue(
			sumOrUnknown([rawCashBalance, positions.nativeValue]),
			perspective
		);
		return {
			...account,
			balance,
			displayBalance: projectSignedValue(
				sumOrUnknown([displayCashBalance, positions.value]),
				perspective
			),
			isConverted: cashConversion.isConverted || positions.isConverted,
			isUnconverted: cashConversion.isUnconverted || positions.isUnconverted,
			missingCurrency: cashConversion.missingCurrency ?? positions.missingCurrency,
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
		this.debouncer.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeReconnect(this._reconnectCallback);
		this.unsubscribeRealtime();
		this.sequence.bump();
	}
}

export function setAccountsContext(
	pb: PocketBaseContext,
	balanceTypesContext: ReturnType<typeof setBalanceTypesContext>
) {
	return setContext('accounts', new AccountsContext(pb, balanceTypesContext));
}

export function getAccountsContext() {
	return getContext<ReturnType<typeof setAccountsContext>>('accounts');
}
