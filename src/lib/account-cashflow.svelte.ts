import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import { computeAveragesFromTransactions, computeCashflowWindow } from './cashflow-utils';
import { getExchangeRatesContext } from './exchange-rates.svelte';
import { logError } from './logger';
import { AccountSharesPerspectiveOptions, type TransactionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';

const DEBOUNCE_MS = 200;

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
	private sequence = new RequestSequence();
	private debouncer = new Debouncer(DEBOUNCE_MS);
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
	private _reconnectCallback = () => this.invalidate();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._pb.registerRealtimeReconnect(this._reconnectCallback);
		this._fx = getExchangeRatesContext();
		this.init();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._activeUserId = userId;
			if (!userId) {
				this.reset();
				this.isLoading = false;
				return;
			}
			this.realtimeSubscribe(userId);
			if (this._accountId) {
				this.isLoading = true;
				void this.recomputeAll().catch((error) => {
					this._pb.handleConnectionError(error, 'accountCashflow', 'init');
				});
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
		void this.recomputeAll().catch((error) => {
			this._pb.handleConnectionError(error, 'accountCashflow', 'set_account');
		});
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

	private onTransactionEvent(e: RecordSubscription<TransactionsResponse>) {
		if (!e.action) return;
		if (e.record.account !== this._accountId) return;
		this.invalidate();
	}

	// A transaction event or a realtime reconnect is a pure invalidation signal: it schedules the
	// debounced windowed refetch rather than patching the event payload. A reconnect carries no
	// record, so it recomputes only when an account is active and someone is signed in.
	private invalidate() {
		if (!this._activeUserId || !this._accountId) return;
		this.debouncer.schedule(
			() =>
				void this.recomputeAll().catch((error) =>
					this._pb.handleConnectionError(error, 'accountCashflow', 'refresh')
				)
		);
	}

	private async recomputeAll() {
		const accountId = this._accountId;
		const token = this.sequence.next();
		const window = computeCashflowWindow();

		try {
			const transactions = await this._pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse>({
					filter: `date >= '${window.earliestKey}' && date < '${window.startNextMonthKey}' && excluded = '' && account = '${accountId}'`,
					fields: 'id,date,value',
					requestKey: null
				});

			if (!this.sequence.isCurrent(token)) return;

			this._transactions = transactions;
		} finally {
			if (!this._disposed && this.sequence.isCurrent(token)) this.isLoading = false;
		}
	}

	private reset() {
		this.sequence.bump();
		this.debouncer.cancel();
		this._transactions = [];
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

export function setAccountCashflowContext(pb: PocketBaseContext) {
	return setContext('accountCashflow', new AccountCashflowContext(pb));
}

export function getAccountCashflowContext() {
	return getContext<ReturnType<typeof setAccountCashflowContext>>('accountCashflow');
}
