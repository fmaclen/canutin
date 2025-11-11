import { UTCDate } from '@date-fns/utc';
import { addMonths, startOfMonth, startOfYear } from 'date-fns';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAccountsContext } from './accounts.svelte';
import type {
	AccountsResponse,
	TransactionLabelsResponse,
	TransactionsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

export type PeriodOption =
	| 'this-month'
	| 'last-month'
	| 'last-3-months'
	| 'last-6-months'
	| 'last-12-months'
	| 'year-to-date'
	| 'last-year'
	| 'lifetime';
export type KindFilter = 'all' | 'credits' | 'debits';

type TransactionExpand = {
	account?: AccountsResponse;
	labels?: TransactionLabelsResponse[];
};

export type TransactionRow = {
	id: string;
	date: Date;
	dateIso: string;
	dateValue: number;
	description: string;
	labels: string[];
	accountName: string;
	accountId: string | null;
	value: number;
	excluded: boolean;
};

class TransactionsContext {
	period: PeriodOption = $state('last-3-months');
	kind: KindFilter = $state('all');
	page: number = $state(1);
	isLoading: boolean = $state(true);
	rawTransactions: TransactionsResponse<TransactionExpand>[] = $state([]);

	readonly periodOptions: PeriodOption[] = [
		'this-month',
		'last-month',
		'last-3-months',
		'last-6-months',
		'last-12-months',
		'year-to-date',
		'last-year',
		'lifetime'
	];
	readonly kindOptions: KindFilter[] = ['all', 'credits', 'debits'];
	readonly pageSize = 50;

	private _pb: PocketBaseContext;
	private _accountsContext: ReturnType<typeof getAccountsContext>;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._accountsContext = getAccountsContext();
		this.init();
	}

	private async init() {
		await this.refreshTransactions();
	}

	async refreshTransactions() {
		this.isLoading = true;
		try {
			const list = await this._pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse<TransactionExpand>>({
					sort: '-date,-created,-id',
					expand: 'account,labels',
					batch: 200,
					requestKey: 'transactions:list'
				});
			this.rawTransactions = list;
		} catch (error) {
			this._pb.handleConnectionError(error, 'transactions', 'refresh');
		} finally {
			this.isLoading = false;
		}
	}

	private getPeriodRange(option: PeriodOption) {
		const now = new UTCDate();
		const startOfThisMonthDate = startOfMonth(now);
		const startOfThisMonth = new UTCDate(
			startOfThisMonthDate.getUTCFullYear(),
			startOfThisMonthDate.getUTCMonth(),
			1,
			0,
			0,
			0,
			0
		);
		switch (option) {
			case 'this-month':
				return { from: startOfThisMonth, to: null } as const;
			case 'last-month': {
				const lastMonthDate = addMonths(startOfThisMonthDate, -1);
				const startOfLastMonth = new UTCDate(
					lastMonthDate.getUTCFullYear(),
					lastMonthDate.getUTCMonth(),
					1,
					0,
					0,
					0,
					0
				);
				return { from: startOfLastMonth, to: startOfThisMonth } as const;
			}
			case 'last-3-months': {
				const threeMonthsAgoDate = addMonths(startOfThisMonthDate, -2);
				const startOfThreeMonthsAgo = new UTCDate(
					threeMonthsAgoDate.getUTCFullYear(),
					threeMonthsAgoDate.getUTCMonth(),
					1,
					0,
					0,
					0,
					0
				);
				return { from: startOfThreeMonthsAgo, to: null } as const;
			}
			case 'last-6-months': {
				const sixMonthsAgoDate = addMonths(startOfThisMonthDate, -5);
				const startOfSixMonthsAgo = new UTCDate(
					sixMonthsAgoDate.getUTCFullYear(),
					sixMonthsAgoDate.getUTCMonth(),
					1,
					0,
					0,
					0,
					0
				);
				return { from: startOfSixMonthsAgo, to: null } as const;
			}
			case 'last-12-months': {
				const twelveMonthsAgoDate = addMonths(startOfThisMonthDate, -11);
				const startOfTwelveMonthsAgo = new UTCDate(
					twelveMonthsAgoDate.getUTCFullYear(),
					twelveMonthsAgoDate.getUTCMonth(),
					1,
					0,
					0,
					0,
					0
				);
				return { from: startOfTwelveMonthsAgo, to: null } as const;
			}
			case 'year-to-date': {
				const yearStartDate = startOfYear(now);
				const startOfYearUtc = new UTCDate(yearStartDate.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
				return { from: startOfYearUtc, to: null } as const;
			}
			case 'last-year': {
				const yearStartDate = startOfYear(now);
				const lastYearStartDate = addMonths(yearStartDate, -12);
				const startOfLastYear = new UTCDate(lastYearStartDate.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
				const startOfThisYear = new UTCDate(yearStartDate.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
				return { from: startOfLastYear, to: startOfThisYear } as const;
			}
			case 'lifetime':
			default:
				return { from: null, to: null } as const;
		}
	}

	get accountNameById() {
		const map = new SvelteMap<string, string>();
		for (const account of this._accountsContext.accounts) map.set(account.id, account.name);
		return map;
	}

	get allRows(): TransactionRow[] {
		return this.rawTransactions.map((txn) => {
			const dateIso = txn.date;
			const date = new Date(dateIso);
			const expandedAccount = txn.expand?.account;
			const accountName = expandedAccount?.name ?? this.accountNameById.get(txn.account) ?? '';
			const expandedLabels = txn.expand?.labels ?? [];
			const dateValue = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
			const labelNames = expandedLabels
				.map((label) => label.name)
				.filter((name): name is string => Boolean(name))
				.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
			return {
				id: txn.id,
				date,
				dateIso,
				dateValue,
				description: (txn.description ?? '').trim(),
				labels: labelNames,
				accountName,
				accountId: txn.account ?? null,
				value: txn.value ?? 0,
				excluded: Boolean(txn.excluded)
			};
		});
	}

	get filteredRows(): TransactionRow[] {
		const { from, to } = this.getPeriodRange(this.period);
		const fromTime = from?.getTime() ?? null;
		const toTime = to?.getTime() ?? null;
		return this.allRows
			.filter((row) => {
				const time = row.dateValue;
				if (fromTime !== null && time < fromTime) return false;
				if (toTime !== null && time >= toTime) return false;
				if (this.kind === 'credits') return row.value > 0;
				if (this.kind === 'debits') return row.value < 0;
				return true;
			})
			.sort((a, b) => {
				if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
				if (b.value !== a.value) return b.value - a.value;
				return a.id.localeCompare(b.id);
			});
	}

	get totalPages(): number {
		const total = this.filteredRows.length;
		if (total === 0) return 1;
		return Math.ceil(total / this.pageSize);
	}

	get paginatedRows(): TransactionRow[] {
		const start = (this.page - 1) * this.pageSize;
		return this.filteredRows.slice(start, start + this.pageSize);
	}
}

const CONTEXT_KEY_TRANSACTIONS = 'transactions';

export function setTransactionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_TRANSACTIONS, new TransactionsContext(pb));
}

export function getTransactionsContext() {
	return getContext<ReturnType<typeof setTransactionsContext>>(CONTEXT_KEY_TRANSACTIONS);
}
