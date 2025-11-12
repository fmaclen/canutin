import { UTCDate } from '@date-fns/utc';
import { format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import type { RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap, SvelteURLSearchParams } from 'svelte/reactivity';
import { get } from 'svelte/store';

import { page } from '$app/stores';

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
export type KindFilter = 'all' | 'credits' | 'debits' | 'excluded';

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

	private _customFromDate: Date | null = $state(null);
	private _customToDate: Date | null = $state(null);

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
	readonly kindOptions: KindFilter[] = ['all', 'credits', 'debits', 'excluded'];
	readonly pageSize = 50;

	private _pb: PocketBaseContext;
	private _accountsContext: ReturnType<typeof getAccountsContext>;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._accountsContext = getAccountsContext();
		this.initFromUrlParams();
		this.init();
		this.setupUrlSync();
	}

	private initFromUrlParams() {
		const currentPage = get(page);
		const params = currentPage.url.searchParams;

		const fromParam = params.get('from');
		const toParam = params.get('to');

		if (fromParam !== null || toParam !== null) {
			this._customFromDate = fromParam && fromParam !== 'lifetime' ? new Date(fromParam) : null;
			this._customToDate = toParam ? new Date(toParam) : null;

			const matchingPeriod = this.findPeriodFromDates(fromParam, toParam);
			if (matchingPeriod) {
				this.period = matchingPeriod;
			}
		}

		const amountParam = params.get('amount');
		if (amountParam && this.kindOptions.includes(amountParam as KindFilter)) {
			this.kind = amountParam as KindFilter;
		}
	}

	private findPeriodFromDates(from: string | null, to: string | null) {
		if (from === 'lifetime' && to === null) {
			return 'lifetime';
		}

		for (const option of this.periodOptions) {
			const range = this.getPeriodRange(option);
			const rangeFrom = range.from ? this.formatDate(range.from) : null;
			const rangeTo = range.to ? this.formatDate(range.to) : null;

			if (rangeFrom === from && rangeTo === to) {
				return option;
			}
		}
		return null;
	}

	private formatDate(date: Date) {
		return format(date, 'yyyy-MM-dd');
	}

	private setupUrlSync() {
		let isFirstRun = true;

		$effect(() => {
			const currentPeriod = this.period;
			const currentKind = this.kind;

			if (isFirstRun) {
				isFirstRun = false;
				return;
			}

			void currentPeriod;
			void currentKind;

			this._customFromDate = null;
			this._customToDate = null;

			const currentPage = get(page);
			const params = new SvelteURLSearchParams(currentPage.url.searchParams);

			const range = this.getPeriodRange(this.period);

			if (this.period === 'lifetime') {
				params.set('from', 'lifetime');
				params.delete('to');
			} else {
				if (range.from) {
					params.set('from', this.formatDate(range.from));
				} else {
					params.delete('from');
				}

				if (range.to) {
					params.set('to', this.formatDate(range.to));
				} else {
					params.delete('to');
				}
			}

			params.set('amount', this.kind);

			const search = params.toString();
			const newUrl = `${currentPage.url.pathname}${search ? `?${search}` : ''}`;

			if (newUrl !== `${currentPage.url.pathname}${currentPage.url.search}`) {
				history.replaceState(history.state, '', newUrl);
			}

			this.refreshTransactions();
		});
	}

	private async init() {
		await this.refreshTransactions();
		this.realtimeSubscribe();
	}

	async refreshTransactions() {
		this.isLoading = true;
		try {
			const filterParts: string[] = [];

			let from: Date | null;
			let to: Date | null;
			if (this._customFromDate !== null || this._customToDate !== null) {
				from = this._customFromDate;
				to = this._customToDate;
			} else {
				const range = this.getPeriodRange(this.period);
				from = range.from;
				to = range.to;
			}

			if (from) {
				filterParts.push(`date >= '${from.toISOString()}'`);
			}
			if (to) {
				filterParts.push(`date < '${to.toISOString()}'`);
			}

			if (this.kind === 'credits') {
				filterParts.push('value > 0');
			} else if (this.kind === 'debits') {
				filterParts.push('value < 0');
			} else if (this.kind === 'excluded') {
				filterParts.push('excluded != ""');
			}

			const filter = filterParts.length > 0 ? filterParts.join(' && ') : undefined;

			const list = await this._pb.authedClient
				.collection('transactions')
				.getFullList<TransactionsResponse<TransactionExpand>>({
					sort: '-date,-created,-id',
					expand: 'account,labels',
					batch: 200,
					filter,
					requestKey: 'transactions:list'
				});
			this.rawTransactions = list;
		} catch (error) {
			this._pb.handleConnectionError(error, 'transactions', 'refresh');
		} finally {
			this.isLoading = false;
		}
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('transactions')
			.subscribe('*', this.onTransactionEvent.bind(this))
			.catch((error) =>
				this._pb.handleSubscriptionError(error, 'transactions', 'subscribe_transactions')
			);
	}

	private async onTransactionEvent(e: RecordSubscription<TransactionsResponse<TransactionExpand>>) {
		if (e.action === 'create') {
			const txn = await this._pb.authedClient
				.collection('transactions')
				.getOne<TransactionsResponse<TransactionExpand>>(e.record.id, {
					expand: 'account,labels'
				});
			this.rawTransactions = [...this.rawTransactions, txn];
		} else if (e.action === 'update') {
			const txn = await this._pb.authedClient
				.collection('transactions')
				.getOne<TransactionsResponse<TransactionExpand>>(e.record.id, {
					expand: 'account,labels'
				});
			this.rawTransactions = this.rawTransactions.map((x) => (x.id === e.record.id ? txn : x));
		} else if (e.action === 'delete') {
			this.rawTransactions = this.rawTransactions.filter((x) => x.id !== e.record.id);
		}
	}

	private getPeriodRange(option: PeriodOption) {
		const now = new UTCDate();
		const startOfThisMonth = startOfMonth(now);

		switch (option) {
			case 'this-month':
				return { from: startOfThisMonth, to: null } as const;
			case 'last-month': {
				const startOfLastMonth = startOfMonth(subMonths(now, 1));
				return { from: startOfLastMonth, to: startOfThisMonth } as const;
			}
			case 'last-3-months': {
				const threeMonthsAgo = startOfMonth(subMonths(now, 2));
				return { from: threeMonthsAgo, to: null } as const;
			}
			case 'last-6-months': {
				const sixMonthsAgo = startOfMonth(subMonths(now, 5));
				return { from: sixMonthsAgo, to: null } as const;
			}
			case 'last-12-months': {
				const twelveMonthsAgo = startOfMonth(subMonths(now, 11));
				return { from: twelveMonthsAgo, to: null } as const;
			}
			case 'year-to-date': {
				const startOfYearUtc = startOfYear(now);
				return { from: startOfYearUtc, to: null } as const;
			}
			case 'last-year': {
				const startOfLastYear = startOfYear(subMonths(now, 12));
				const startOfThisYear = startOfYear(now);
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

	get allRows() {
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

	get filteredRows() {
		let from: Date | null;
		let to: Date | null;

		if (this._customFromDate !== null || this._customToDate !== null) {
			from = this._customFromDate;
			to = this._customToDate;
		} else {
			const range = this.getPeriodRange(this.period);
			from = range.from;
			to = range.to;
		}

		const fromTime = from?.getTime() ?? null;
		const toTime = to?.getTime() ?? null;
		return this.allRows
			.filter((row) => {
				const time = row.dateValue;
				if (fromTime !== null && time < fromTime) return false;
				if (toTime !== null && time >= toTime) return false;
				if (this.kind === 'credits') return row.value > 0;
				if (this.kind === 'debits') return row.value < 0;
				if (this.kind === 'excluded') return row.excluded;
				return true;
			})
			.sort((a, b) => {
				if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
				if (b.value !== a.value) return b.value - a.value;
				return a.id.localeCompare(b.id);
			});
	}

	get totalPages() {
		const total = this.filteredRows.length;
		if (total === 0) return 1;
		return Math.ceil(total / this.pageSize);
	}

	get paginatedRows() {
		const start = (this.page - 1) * this.pageSize;
		return this.filteredRows.slice(start, start + this.pageSize);
	}

	dispose() {
		this._pb.authedClient.collection('transactions').unsubscribe();
	}
}

const CONTEXT_KEY_TRANSACTIONS = 'transactions';

export function setTransactionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_TRANSACTIONS, new TransactionsContext(pb));
}

export function getTransactionsContext() {
	return getContext<ReturnType<typeof setTransactionsContext>>(CONTEXT_KEY_TRANSACTIONS);
}
