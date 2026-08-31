import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import { computeAveragesFromTransactions, computeCashflowWindow } from './cashflow-utils';
import { getExchangeRatesContext } from './exchange-rates.svelte';
import { logError } from './logger';
import { AccountSharesPerspectiveOptions, type TransactionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { StaleSync } from './realtime-sync';

class AccountCashflowContext {
	isLoading: boolean = $state(true);

	// NOTE: averages derive from the cached native transactions so they reconvert whenever the
	// exchange rates load or the display currency changes (convert() reads both reactively),
	// without refetching. currencyOf/perspectiveOf ignore their id argument because every cached
	// transaction belongs to this single account.
	private _averages = $derived.by(() =>
		computeAveragesFromTransactions(this._transactions, {
			window: computeCashflowWindow(),
			perspectiveOf: () => this._perspective,
			currencyOf: () => this._currency,
			convert: (value, currency, date) => this._fx.convert(value, currency, date)
		})
	);
	get avg3m() {
		return this._averages.avg3m;
	}
	get avg6m() {
		return this._averages.avg6m;
	}
	get avgYtd() {
		return this._averages.avgYtd;
	}
	get avg1y() {
		return this._averages.avg1y;
	}

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _fx: ReturnType<typeof getExchangeRatesContext>;
	private _transactions: TransactionsResponse[] = $state([]);
	private sync: StaleSync;
	private _unsubscribe: (() => void) | null = null;
	private _disposed = false;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _accountId = '';
	private _currency = $state('USD');
	private _perspective = $state<AccountSharesPerspectiveOptions>(
		AccountSharesPerspectiveOptions.NORMAL
	);
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this.sync = new StaleSync(pb, 'accountCashflow', 'refresh', (token) =>
			this.recomputeAll(token)
		);
		this._pb.registerRealtimeSync(this.sync);
		this._fx = getExchangeRatesContext();
		this.init();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.reset();
			this._activeUserId = userId;
			if (!userId) {
				this.isLoading = false;
				return;
			}
			this.realtimeSubscribe(userId);
			if (this._accountId) {
				this.isLoading = true;
				void this.sync.refreshNow();
			}
		});
	}

	setAccount(accountId: string, perspective: AccountSharesPerspectiveOptions, currency: string) {
		if (
			accountId === this._accountId &&
			perspective === this._perspective &&
			currency === this._currency
		)
			return;
		this._accountId = accountId;
		this._perspective = perspective;
		this._currency = currency;
		this.reset();
		if (!accountId || !this._activeUserId) {
			this.isLoading = false;
			return;
		}
		this.isLoading = true;
		void this.sync.refreshNow();
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;
		this._isSubscribed = true;
		this._pb.authedClient
			.collection('transactions')
			.subscribe('*', this.onTransactionEvent.bind(this))
			.then((unsubscribe) => {
				if (this._disposed || userId !== this._activeUserId) {
					unsubscribe();
					return;
				}

				this._unsubscribe = unsubscribe;
			})
			.catch((error) => {
				if (this._disposed) return;
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'accountCashflow', 'subscribe');
				} else {
					logError('accountCashflowStore', 'stale_subscription', error);
				}
			});
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._unsubscribe?.();
		this._unsubscribe = null;
	}

	// A transaction event is a pure invalidation signal: it marks the store stale and schedules the
	// windowed refetch rather than patching the event payload. Events for other accounts are filtered
	// out here because this store caches exactly one account's transactions.
	private onTransactionEvent(e: RecordSubscription<TransactionsResponse>) {
		if (!e.action) return;
		if (e.record.account !== this._accountId) return;
		this.sync.invalidate();
	}

	private async recomputeAll(token: number) {
		const accountId = this._accountId;
		// Staleness is scoped to the mounted account, so a mark that arrives while none is mounted is
		// a successful no-op: setAccount always refetches, and until it runs there is nothing to sync.
		if (!accountId || !this._activeUserId) return;
		const window = computeCashflowWindow();

		try {
			const transactions = await this._pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse>({
					filter: `date >= '${window.earliestKey}' && date < '${window.startNextMonthKey}' && excluded = '' && account = '${accountId}'`,
					fields: 'id,date,value',
					requestKey: null
				});

			if (!this.sync.isCurrent(token)) return;

			this._transactions = transactions;
		} finally {
			if (!this._disposed && this.sync.isCurrent(token)) this.isLoading = false;
		}
	}

	private reset() {
		this.sync.cancel();
		this._transactions = [];
	}

	dispose() {
		this._disposed = true;
		this.sync.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeSync(this.sync);
		this.unsubscribeRealtime();
	}
}

export function setAccountCashflowContext(pb: PocketBaseContext) {
	return setContext('accountCashflow', new AccountCashflowContext(pb));
}

export function getAccountCashflowContext() {
	return getContext<ReturnType<typeof setAccountCashflowContext>>('accountCashflow');
}
