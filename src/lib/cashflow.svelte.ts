import PocketBase, { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';

import type { TransactionsResponse } from './pocketbase.schema';

type CashflowAverages = { income: number; expenses: number; surplus: number };

class CashflowContext {
	avg3m: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avg6m: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avgYtd: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });
	avg1y: CashflowAverages = $state({ income: 0, expenses: 0, surplus: 0 });

	private _pb: PocketBase;

	constructor(pb: PocketBase) {
		this._pb = pb;
		this.init();
	}

	private async init() {
		await this.recomputeAll();
		this.realtimeSubscribe();
	}

	private realtimeSubscribe() {
		this._pb.collection('accountBalances').subscribe('*', this.onTransactionEvent.bind(this));
		this._pb.collection('transactions').subscribe('*', this.onTransactionEvent.bind(this));
	}

	private async onTransactionEvent(e: RecordSubscription<TransactionsResponse>) {
		if (e.action) await this.recomputeAll();
	}

	private startOfUtcMonth(year: number, monthIndex: number) {
		return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
	}

	private monthStartUtcNow() {
		const now = new Date();
		return this.startOfUtcMonth(now.getUTCFullYear(), now.getUTCMonth());
	}

	private addMonthsUtc(d: Date, months: number) {
		return this.startOfUtcMonth(d.getUTCFullYear(), d.getUTCMonth() + months);
	}

	private async recomputeAll() {
		console.log('[cashflow] recomputeAll');
		const startOfThisMonth = this.monthStartUtcNow();
		const start12m = this.addMonthsUtc(startOfThisMonth, -11);
		const start6m = this.addMonthsUtc(startOfThisMonth, -5);
		const start3m = this.addMonthsUtc(startOfThisMonth, -2);
		const startYtd = new Date(Date.UTC(startOfThisMonth.getUTCFullYear(), 0, 1, 0, 0, 0, 0));

		// Fetch all needed transactions since the earliest required start
		const earliest = start12m < startYtd ? start12m : startYtd;
		const earliestIso = earliest.toISOString();

		const txns = await this._pb
			.collection('transactions')
			.getFullList<TransactionsResponse>({ filter: `date >= '${earliestIso}'` });

		const compute = (from: Date) => {
			let income = 0;
			let expenses = 0;
			for (const t of txns) {
				if (t.excluded) continue;
				const td = t.date ? new Date(t.date) : null;
				if (!td || td < from) continue;
				const v = t.value ?? 0;
				if (v >= 0) income += v;
				else expenses += v; // negative values accumulate
			}
			const surplus = income + expenses;
			return { income, expenses, surplus } as const;
		};

		const sums3m = compute(start3m);
		const sums6m = compute(start6m);
		const sumsYtd = compute(startYtd);
		const sums1y = compute(start12m);

		const monthsYtd = startOfThisMonth.getUTCMonth() + 1; // Jan=0 -> count inclusive

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
	}

	dispose() {
		this._pb.collection('transactions').unsubscribe();
	}
}

export const CONTEXT_KEY_CASHFLOW = 'cashflow';

export function setCashflowContext(pb: PocketBase) {
	return setContext(CONTEXT_KEY_CASHFLOW, new CashflowContext(pb));
}

export function getCashflowContext() {
	return getContext<ReturnType<typeof setCashflowContext>>(CONTEXT_KEY_CASHFLOW);
}
