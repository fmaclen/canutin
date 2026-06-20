import { UTCDate } from '@date-fns/utc';
import { addMonths, format, startOfMonth, startOfYear } from 'date-fns';

import { getFormattingLocale } from './interface-preferences.svelte';
import { AccountSharesPerspectiveOptions, type TransactionsResponse } from './pocketbase.schema';
import { projectSignedValue } from './sharing';
import { toPocketBaseDateString } from './utils';

export type CashflowAverages = { income: number; expenses: number; surplus: number };

export type CashflowWindow = {
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

export function computeCashflowWindow() {
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

export function computeAveragesFromTransactions(
	transactions: Iterable<Pick<TransactionsResponse, 'date' | 'account' | 'value'>>,
	{
		window,
		perspectiveOf
	}: {
		window: CashflowWindow;
		perspectiveOf: (accountId: string) => AccountSharesPerspectiveOptions;
	}
) {
	const sums3m = { income: 0, expenses: 0, surplus: 0 };
	const sums6m = { income: 0, expenses: 0, surplus: 0 };
	const sumsYtd = { income: 0, expenses: 0, surplus: 0 };
	const sums1y = { income: 0, expenses: 0, surplus: 0 };
	const sumsByMonth = new Map<string, { income: number; expenses: number }>();

	for (let i = 0; i < CASHFLOW_PERIODS; i++) {
		const month = addMonths(window.startOfThisMonth, -(CASHFLOW_PERIODS - 1 - i));
		sumsByMonth.set(format(month, 'yyyy-MM'), { income: 0, expenses: 0 });
	}

	for (const t of transactions) {
		if (!t.date) continue;
		const date = new Date(t.date);
		const value = projectSignedValue(t.value ?? 0, perspectiveOf(t.account));
		const bucket = value >= 0 ? 'income' : 'expenses';

		if (date >= window.start3m) sums3m[bucket] += value;
		if (date >= window.start6m) sums6m[bucket] += value;
		if (date >= window.startYtd) sumsYtd[bucket] += value;
		if (date >= window.start12m) sums1y[bucket] += value;

		const monthSums = sumsByMonth.get(t.date.slice(0, 7));
		if (monthSums) monthSums[bucket] += value;
	}

	sums3m.surplus = sums3m.income + sums3m.expenses;
	sums6m.surplus = sums6m.income + sums6m.expenses;
	sumsYtd.surplus = sumsYtd.income + sumsYtd.expenses;
	sums1y.surplus = sums1y.income + sums1y.expenses;

	const monthsYtd = window.startOfThisMonth.getUTCMonth() + 1;

	const avg3m = {
		income: sums3m.income / 3,
		expenses: sums3m.expenses / 3,
		surplus: sums3m.surplus / 3
	};
	const avg6m = {
		income: sums6m.income / 6,
		expenses: sums6m.expenses / 6,
		surplus: sums6m.surplus / 6
	};
	const avgYtd = {
		income: sumsYtd.income / monthsYtd,
		expenses: sumsYtd.expenses / monthsYtd,
		surplus: sumsYtd.surplus / monthsYtd
	};
	const avg1y = {
		income: sums1y.income / 12,
		expenses: sums1y.expenses / 12,
		surplus: sums1y.surplus / 12
	};

	const periods: CashflowPeriod[] = [];

	for (let i = 0; i < CASHFLOW_PERIODS; i++) {
		const monthOffset = CASHFLOW_PERIODS - 1 - i;
		const month = addMonths(window.startOfThisMonth, -monthOffset);
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
			periodLabel: new Intl.DateTimeFormat(getFormattingLocale(), {
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC'
			}).format(month)
		});
	}

	return { avg3m, avg6m, avgYtd, avg1y, periods };
}
