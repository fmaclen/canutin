import { UTCDate } from '@date-fns/utc';
import { addMonths, format, startOfMonth, startOfYear } from 'date-fns';
import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext, untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAccountsContext, type AccountWithBalance } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import { AccountSharesPerspectiveOptions, type TransactionsResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { projectSignedValue } from './sharing';
import { toPocketBaseDateString } from './utils';

type CashflowAverages = { income: number; expenses: number; surplus: number };

type CashflowWindow = {
	startOfThisMonth: Date;
	start12m: Date;
	start6m: Date;
	start3m: Date;
	startYtd: Date;
	earliest: Date;
	startNextMonth: Date;
	earliestKey: string;
	startNextMonthKey: string;
};

export const CASHFLOW_PERIODS = 13;

export type CashflowPeriod = {
	id: number;
	month: Date;
	income: number;
	expenses: number;
	surplus: number;
	isCurrentPeriod: boolean;
	periodLabel: string;
};

const DEBOUNCE_MS = 200;

class CashflowContext {
	avg3m: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avg6m: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avgYtd: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avg1y: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });

	periods: CashflowPeriod[] = $state([]);
	isLoading: boolean = $state(true);

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _accountsContext: ReturnType<typeof getAccountsContext>;
	private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _unsubscribe: (() => void) | null = null;
	private _disposed = false;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _recomputeSequence = 0;
	private _recomputeAllInFlight = 0;
	private _transactionsById = new SvelteMap<string, TransactionsResponse>();
	private _activeWindow: CashflowWindow | null = null;
	private _hasTransactionSnapshot = false;
	private _watchedAccountsKey: string | null = null;
	private _teardownCallback = () => this.unsubscribeRealtime();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._accountsContext = getAccountsContext();
		this.init();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._activeUserId = userId;
			if (!userId) {
				this._recomputeSequence++;
				if (this._debounceTimer) {
					clearTimeout(this._debounceTimer);
					this._debounceTimer = null;
				}
				this._transactionsById = new SvelteMap();
				this._activeWindow = null;
				this._hasTransactionSnapshot = false;
				this._watchedAccountsKey = null;
				this.periods = [];
				this.avg3m = { income: 0, expenses: 0, surplus: 0 };
				this.avg6m = { income: 0, expenses: 0, surplus: 0 };
				this.avgYtd = { income: 0, expenses: 0, surplus: 0 };
				this.avg1y = { income: 0, expenses: 0, surplus: 0 };
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
					this._pb.handleSubscriptionError(error, 'cashflow', 'subscribe');
				} else {
					console.error('[cashflowStore] Stale subscription failed:', error);
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

		const cashflowWindow = this.getCashflowWindow();
		const activeWindow = this._activeWindow;
		let shouldRecomputeAll = false;
		let shouldRecomputeFromMap = false;

		if (
			!this._hasTransactionSnapshot ||
			!activeWindow ||
			activeWindow.earliestKey !== cashflowWindow.earliestKey ||
			activeWindow.startNextMonthKey !== cashflowWindow.startNextMonthKey
		) {
			shouldRecomputeAll = true;
		} else {
			if (e.action === 'delete') {
				if (this._transactionsById.delete(e.record.id)) {
					shouldRecomputeFromMap = true;
				} else {
					const membership = this.transactionWindowMembership(e.record, activeWindow);
					shouldRecomputeAll = membership !== false;
				}
			} else if (e.action === 'create' || e.action === 'update') {
				const membership = this.transactionWindowMembership(e.record, activeWindow);

				if (membership === null) {
					shouldRecomputeAll = true;
				} else if (membership) {
					if (!this._accountsContext.accounts.some((account) => account.id === e.record.account)) {
						shouldRecomputeAll = true;
					} else {
						this._transactionsById.set(e.record.id, e.record);
						shouldRecomputeFromMap = true;
					}
				} else if (this._transactionsById.delete(e.record.id)) {
					shouldRecomputeFromMap = true;
				}
			} else {
				shouldRecomputeAll = true;
			}

			if (shouldRecomputeFromMap) {
				shouldRecomputeAll = this._recomputeAllInFlight > 0;
				this._recomputeSequence++;
				this.recomputeFromTransactionMap(this._accountsContext.accounts, activeWindow);
				if (!shouldRecomputeAll) return;
			}
		}

		if (!shouldRecomputeAll) return;

		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}

		this._debounceTimer = setTimeout(() => {
			this._debounceTimer = null;
			void this.recomputeAll(this._accountsContext.accounts).catch((error) => {
				console.error('[cashflow:recompute_on_event]', error);
			});
		}, DEBOUNCE_MS);
	}

	private async recomputeAll(accounts: AccountWithBalance[]) {
		const recomputeSequence = ++this._recomputeSequence;
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

			if (recomputeSequence !== this._recomputeSequence) return;

			this._transactionsById = new SvelteMap(
				txns.map((transaction) => [transaction.id, transaction])
			);
			this._activeWindow = cashflowWindow;
			this._hasTransactionSnapshot = true;
			this._watchedAccountsKey = this.getWatchedAccountsKey(accounts);
			this.recomputeFromTransactionMap(accounts, cashflowWindow);
		} finally {
			this._recomputeAllInFlight--;
			if (!this._disposed && recomputeSequence === this._recomputeSequence) this.isLoading = false;
		}
	}

	private getCashflowWindow() {
		const now = new UTCDate();
		const startOfThisMonth = startOfMonth(now);
		const start13m = addMonths(startOfThisMonth, -(CASHFLOW_PERIODS - 1));
		const startYtd = startOfYear(now);
		const earliest = start13m < startYtd ? start13m : startYtd;
		const startNextMonth = addMonths(startOfThisMonth, 1);

		return {
			startOfThisMonth,
			start12m: addMonths(startOfThisMonth, -11),
			start6m: addMonths(startOfThisMonth, -5),
			start3m: addMonths(startOfThisMonth, -2),
			startYtd,
			earliest,
			startNextMonth,
			earliestKey: toPocketBaseDateString(earliest),
			startNextMonthKey: toPocketBaseDateString(startNextMonth)
		};
	}

	private transactionWindowMembership(
		transaction: TransactionsResponse,
		cashflowWindow: CashflowWindow
	) {
		if (!transaction.date || !('excluded' in transaction)) return null;

		const date = new Date(transaction.date);
		if (Number.isNaN(date.valueOf())) return null;

		return (
			date >= cashflowWindow.earliest &&
			date < cashflowWindow.startNextMonth &&
			!transaction.excluded
		);
	}

	private recomputeFromTransactionMap(
		accounts: AccountWithBalance[],
		cashflowWindow: CashflowWindow
	) {
		const accountPerspectiveById = new SvelteMap(
			accounts.map((account) => [account.id, account.perspective])
		);
		const sums3m = { income: 0, expenses: 0, surplus: 0 };
		const sums6m = { income: 0, expenses: 0, surplus: 0 };
		const sumsYtd = { income: 0, expenses: 0, surplus: 0 };
		const sums1y = { income: 0, expenses: 0, surplus: 0 };
		const sumsByMonth = new SvelteMap<string, { income: number; expenses: number }>();

		for (let i = 0; i < CASHFLOW_PERIODS; i++) {
			const month = addMonths(cashflowWindow.startOfThisMonth, -(CASHFLOW_PERIODS - 1 - i));
			sumsByMonth.set(format(month, 'yyyy-MM'), { income: 0, expenses: 0 });
		}

		for (const t of this._transactionsById.values()) {
			if (!t.date) continue;
			const date = new Date(t.date);
			const value = projectSignedValue(
				t.value ?? 0,
				accountPerspectiveById.get(t.account) ?? AccountSharesPerspectiveOptions.NORMAL
			);
			const bucket = value >= 0 ? 'income' : 'expenses';

			if (date >= cashflowWindow.start3m) sums3m[bucket] += value;
			if (date >= cashflowWindow.start6m) sums6m[bucket] += value;
			if (date >= cashflowWindow.startYtd) sumsYtd[bucket] += value;
			if (date >= cashflowWindow.start12m) sums1y[bucket] += value;

			const monthSums = sumsByMonth.get(t.date.slice(0, 7));
			if (monthSums) monthSums[bucket] += value;
		}

		sums3m.surplus = sums3m.income + sums3m.expenses;
		sums6m.surplus = sums6m.income + sums6m.expenses;
		sumsYtd.surplus = sumsYtd.income + sumsYtd.expenses;
		sums1y.surplus = sums1y.income + sums1y.expenses;

		const monthsYtd = cashflowWindow.startOfThisMonth.getUTCMonth() + 1;

		this.avg3m = {
			income: sums3m.income / 3,
			expenses: sums3m.expenses / 3,
			surplus: sums3m.surplus / 3
		};
		this.avg6m = {
			income: sums6m.income / 6,
			expenses: sums6m.expenses / 6,
			surplus: sums6m.surplus / 6
		};
		this.avgYtd = {
			income: sumsYtd.income / monthsYtd,
			expenses: sumsYtd.expenses / monthsYtd,
			surplus: sumsYtd.surplus / monthsYtd
		};
		this.avg1y = {
			income: sums1y.income / 12,
			expenses: sums1y.expenses / 12,
			surplus: sums1y.surplus / 12
		};

		const periods: CashflowPeriod[] = [];

		for (let i = 0; i < CASHFLOW_PERIODS; i++) {
			const monthOffset = CASHFLOW_PERIODS - 1 - i;
			const month = addMonths(cashflowWindow.startOfThisMonth, -monthOffset);
			const isCurrentPeriod = monthOffset === 0;

			const periodKey = format(month, 'yyyy-MM');
			const monthSums = sumsByMonth.get(periodKey) ?? { income: 0, expenses: 0 };

			periods.push({
				id: i,
				month,
				income: monthSums.income,
				expenses: monthSums.expenses,
				surplus: monthSums.income + monthSums.expenses,
				isCurrentPeriod,
				periodLabel: format(month, 'MMMM yyyy')
			});
		}

		this.periods = periods;
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

export const CONTEXT_KEY_CASHFLOW = 'cashflow';

export function setCashflowContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_CASHFLOW, new CashflowContext(pb));
}

export function getCashflowContext() {
	return getContext<ReturnType<typeof setCashflowContext>>(CONTEXT_KEY_CASHFLOW);
}
