import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import { getAuthContext } from './auth.svelte';
import {
	computeAveragesFromTransactions,
	computeCashflowWindow,
	type CashflowAverages
} from './cashflow-utils';
import { AccountSharesPerspectiveOptions, type TransactionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

const DEBOUNCE_MS = 200;

class AccountCashflowContext {
	avg3m: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avg6m: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avgYtd: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avg1y: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });

	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _unsubscribe: (() => void) | null = null;
	private _disposed = false;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _recomputeSequence = 0;
	private _accountId = '';
	private _perspective: AccountSharesPerspectiveOptions = AccountSharesPerspectiveOptions.NORMAL;
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
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

	setAccount(accountId: string, perspective: AccountSharesPerspectiveOptions) {
		if (accountId === this._accountId && perspective === this._perspective) return;
		this._accountId = accountId;
		this._perspective = perspective;
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
					console.error('[accountCashflowStore] Stale subscription failed:', error);
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

		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}

		this._debounceTimer = setTimeout(() => {
			this._debounceTimer = null;
			void this.recomputeAll().catch((error) => {
				console.error('[accountCashflow:recompute_on_event]', error);
			});
		}, DEBOUNCE_MS);
	}

	private async recomputeAll() {
		const accountId = this._accountId;
		const perspective = this._perspective;
		const recomputeSequence = ++this._recomputeSequence;
		const window = computeCashflowWindow();

		try {
			const transactions = await this._pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse>({
					filter: `date >= '${window.earliestKey}' && date < '${window.startNextMonthKey}' && excluded = '' && account = '${accountId}'`,
					fields: 'id,date,value',
					requestKey: null
				});

			if (recomputeSequence !== this._recomputeSequence) return;

			const { avg3m, avg6m, avgYtd, avg1y } = computeAveragesFromTransactions(transactions, {
				window,
				perspectiveOf: () => perspective
			});

			this.avg3m = avg3m;
			this.avg6m = avg6m;
			this.avgYtd = avgYtd;
			this.avg1y = avg1y;
		} finally {
			if (!this._disposed && recomputeSequence === this._recomputeSequence) this.isLoading = false;
		}
	}

	private reset() {
		this._recomputeSequence++;
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = null;
		}
		this.avg3m = { income: 0, expenses: 0, surplus: 0 };
		this.avg6m = { income: 0, expenses: 0, surplus: 0 };
		this.avgYtd = { income: 0, expenses: 0, surplus: 0 };
		this.avg1y = { income: 0, expenses: 0, surplus: 0 };
	}

	dispose() {
		this._disposed = true;
		this._recomputeSequence++;
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = null;
		}
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this.unsubscribeRealtime();
	}
}

export const CONTEXT_KEY_ACCOUNT_CASHFLOW = 'accountCashflow';

export function setAccountCashflowContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_ACCOUNT_CASHFLOW, new AccountCashflowContext(pb));
}

export function getAccountCashflowContext() {
	return getContext<ReturnType<typeof setAccountCashflowContext>>(CONTEXT_KEY_ACCOUNT_CASHFLOW);
}
