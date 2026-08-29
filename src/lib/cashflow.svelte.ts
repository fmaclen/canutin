import { getContext, setContext, untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAccountsContext, type AccountWithBalance } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import {
	computeAveragesFromTransactions,
	computeCashflowWindow,
	type CashflowAverages,
	type CashflowPeriod,
	type CashflowWindow
} from './cashflow-utils';
import { getExchangeRatesContext } from './exchange-rates.svelte';
import { logError } from './logger';
import { AccountSharesPerspectiveOptions, type TransactionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';

const DEBOUNCE_MS = 200;

class CashflowContext {
	avg3m: CashflowAverages = $state({
		income: 0,
		expenses: 0,
		surplus: 0,
		isUnconverted: false
	});
	avg6m: CashflowAverages = $state({
		income: 0,
		expenses: 0,
		surplus: 0,
		isUnconverted: false
	});
	avgYtd: CashflowAverages = $state({
		income: 0,
		expenses: 0,
		surplus: 0,
		isUnconverted: false
	});
	avg1y: CashflowAverages = $state({
		income: 0,
		expenses: 0,
		surplus: 0,
		isUnconverted: false
	});

	periods: CashflowPeriod[] = $state([]);
	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _fx: ReturnType<typeof getExchangeRatesContext>;
	private _accountsContext: ReturnType<typeof getAccountsContext>;
	private debouncer = new Debouncer(DEBOUNCE_MS);
	private _unsubscribe: (() => void) | null = null;
	private _disposed = false;
	private _activeUserId = '';
	private _isSubscribed = false;
	private sequence = new RequestSequence();
	private _recomputeAllInFlight = 0;
	private _transactionsById = new SvelteMap<string, TransactionsResponse>();
	private _activeWindow: CashflowWindow | null = null;
	private _hasTransactionSnapshot = false;
	private _watchedAccountsKey: string | null = null;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _reconnectCallback = () => this.invalidate();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._pb.registerRealtimeReconnect(this._reconnectCallback);
		this._fx = getExchangeRatesContext();
		this._accountsContext = getAccountsContext();
		this.init();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.debouncer.cancel();
			this.sequence.bump();
			this._activeUserId = userId;
			if (!userId) {
				this._transactionsById = new SvelteMap();
				this._activeWindow = null;
				this._hasTransactionSnapshot = false;
				this._watchedAccountsKey = null;
				this.periods = [];
				this.avg3m = {
					income: 0,
					expenses: 0,
					surplus: 0,
					isUnconverted: false
				};
				this.avg6m = {
					income: 0,
					expenses: 0,
					surplus: 0,
					isUnconverted: false
				};
				this.avgYtd = {
					income: 0,
					expenses: 0,
					surplus: 0,
					isUnconverted: false
				};
				this.avg1y = {
					income: 0,
					expenses: 0,
					surplus: 0,
					isUnconverted: false
				};
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.realtimeSubscribe(userId);
		});

		// Perf-critical: `accounts` is a $derived that gets a new identity on every
		// balance tick, so this effect re-runs constantly. It must NOT refetch all
		// transactions each time. We gate on `watchedAccountsKey` (account ids +
		// perspectives): a balance-only change recomputes from the in-memory
		// transaction map (no network); only a change to the watched accounts or a
		// roll-over of the cashflow window triggers a full recomputeAll() fetch.
		// Reverting this to recomputeAll(accounts) on every run reintroduces a full
		// transactions getFullList on every balance event (the regression this fixes).
		$effect(() => {
			const userId = this._auth.currentUserId;
			const accounts = this._accountsContext.accounts;
			if (!userId || userId !== this._activeUserId) return;
			const watchedAccountsKey = this.getWatchedAccountsKey(accounts);
			const activeWindow = this._activeWindow;
			const cashflowWindow = this.getCashflowWindow();

			if (watchedAccountsKey === this._watchedAccountsKey) {
				if (!activeWindow) {
					if (this._recomputeAllInFlight > 0) return;
				} else if (
					activeWindow.earliestKey === cashflowWindow.earliestKey &&
					activeWindow.startNextMonthKey === cashflowWindow.startNextMonthKey &&
					this._hasTransactionSnapshot
				) {
					untrack(() => {
						if (this._recomputeAllInFlight === 0) {
							this.recomputeFromTransactionMap(accounts, activeWindow);
						}
					});
					return;
				}
			}

			this._watchedAccountsKey = watchedAccountsKey;
			void this.recomputeAll(accounts).catch((error) => {
				if (this._watchedAccountsKey === watchedAccountsKey) this._watchedAccountsKey = null;
				this._pb.handleConnectionError(error, 'cashflow', 'init');
			});
		});
	}

	private getWatchedAccountsKey(accounts: AccountWithBalance[]) {
		return accounts
			.map((account) => `${account.id}:${account.perspective}`)
			.sort()
			.join('|');
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;
		this._isSubscribed = true;
		this._pb.authedClient
			.collection('transactions')
			.subscribe('*', () => this.onRealtimeEvent(userId))
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
					this._pb.handleSubscriptionError(error, 'cashflow', 'subscribe');
				} else {
					logError('cashflowStore', 'stale_subscription', error);
				}
			});
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._unsubscribe?.();
		this._unsubscribe = null;
	}

	private onRealtimeEvent(userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		this.invalidate();
	}

	// A transaction event (or a reconnect) is a pure invalidation signal: instead of patching the
	// in-memory transaction map from the event payload, it schedules a debounced full refetch of the
	// windowed transactions via recomputeAll. Projection (recomputeFromTransactionMap driven by the
	// accounts effect) stays incremental and network-free; only this sync path was ever a refetch.
	private invalidate() {
		this.debouncer.schedule(
			() =>
				void this.recomputeAll(this._accountsContext.accounts).catch((error) =>
					this._pb.handleConnectionError(error, 'cashflow', 'refresh')
				)
		);
	}

	private async recomputeAll(accounts: AccountWithBalance[]) {
		const token = this.sequence.next();
		const cashflowWindow = this.getCashflowWindow();

		this._recomputeAllInFlight++;
		try {
			const txns = await this._pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse>({
					filter: `date >= '${cashflowWindow.earliestKey}' && date < '${cashflowWindow.startNextMonthKey}' && excluded = ''`,
					fields: 'id,date,account,value',
					requestKey: null
				});

			if (!this.sequence.isCurrent(token)) return;

			this._transactionsById = new SvelteMap(
				txns.map((transaction) => [transaction.id, transaction])
			);
			this._activeWindow = cashflowWindow;
			this._hasTransactionSnapshot = true;
			this._watchedAccountsKey = this.getWatchedAccountsKey(accounts);
			this.recomputeFromTransactionMap(accounts, cashflowWindow);
		} finally {
			this._recomputeAllInFlight--;
			if (!this._disposed && this.sequence.isCurrent(token)) this.isLoading = false;
		}
	}

	private getCashflowWindow() {
		return computeCashflowWindow();
	}

	private recomputeFromTransactionMap(
		accounts: AccountWithBalance[],
		cashflowWindow: CashflowWindow
	) {
		const accountPerspectiveById = new SvelteMap(
			accounts.map((account) => [account.id, account.perspective])
		);
		const accountCurrencyById = new SvelteMap(
			accounts.map((account) => [account.id, account.currency])
		);

		const { avg3m, avg6m, avgYtd, avg1y, periods } = computeAveragesFromTransactions(
			this._transactionsById.values(),
			{
				window: cashflowWindow,
				perspectiveOf: (accountId) =>
					accountPerspectiveById.get(accountId) ?? AccountSharesPerspectiveOptions.NORMAL,
				currencyOf: (accountId) => accountCurrencyById.get(accountId) ?? 'USD',
				convert: (value, currency, date) => this._fx.convert(value, currency, date)
			}
		);

		this.avg3m = avg3m;
		this.avg6m = avg6m;
		this.avgYtd = avgYtd;
		this.avg1y = avg1y;
		this.periods = periods;
	}

	dispose() {
		this._disposed = true;
		this.sequence.bump();
		this.debouncer.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeReconnect(this._reconnectCallback);
		this.unsubscribeRealtime();
	}
}

export function setCashflowContext(pb: PocketBaseContext) {
	return setContext('cashflow', new CashflowContext(pb));
}

export function getCashflowContext() {
	return getContext<ReturnType<typeof setCashflowContext>>('cashflow');
}
