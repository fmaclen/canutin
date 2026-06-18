import { UTCDate } from '@date-fns/utc';
import type { RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';

import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';

import { getAccountsContext } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import type {
	AccountsResponse,
	TransactionLabelsResponse,
	TransactionsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import {
	createSortComparator,
	toPocketBaseDateString,
	type SortDirection,
	type SortState
} from './utils';

export type TransactionSortColumn = 'date' | 'description' | 'account' | 'amount';

function isTransactionSortColumn(column: string): column is TransactionSortColumn {
	return (
		column === 'date' || column === 'description' || column === 'account' || column === 'amount'
	);
}

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
	labelIds: string[];
	labels: string[];
	labelChips: { id: string; name: string }[];
	accountName: string;
	accountId: string | null;
	accountIsShared: boolean;
	value: number;
	hasProjectedValue: boolean;
	excluded: boolean;
};

class TransactionsContext {
	period: PeriodOption = $state('last-3-months');
	kind: KindFilter = $state('all');
	search: string = $state('');
	accountFilter: string | null = $state(null);
	labelFilters: string[] = $state([]);
	currentListPath: string = $state('/transactions');
	page: number = $state(1);
	isLoading: boolean = $state(true);
	rawTransactions: TransactionsResponse<TransactionExpand>[] = $state([]);
	summaryTransactions: TransactionsResponse<TransactionExpand>[] = $state([]);
	serverTotalItems: number = $state(0);
	transactionLabels: TransactionLabelsResponse[] = $state([]);
	sortColumn: TransactionSortColumn | null = $state('date');
	sortDirection: SortDirection | null = $state('desc');

	private _selectedIds: SvelteSet<string> = new SvelteSet();
	private _customFromDate: Date | null = $state(null);
	private _customToDate: Date | null = $state(null);
	private _customLabel: string | null = $state(null);
	private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _loadingDelayTimer: ReturnType<typeof setTimeout> | null = null;
	private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _unsubscribe: (() => void) | null = null;
	private _unsubscribeLabels: (() => void) | null = null;
	private _refreshSequence = 0;
	private _pageRefreshSequence = 0;
	private _summaryRefreshSequence = 0;

	private static readonly LOADING_DELAY_MS = 150;
	private static readonly SEARCH_DEBOUNCE_MS = 300;
	private static readonly REFRESH_DEBOUNCE_MS = 200;

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
	private _auth: ReturnType<typeof getAuthContext>;
	private _accountsContext: ReturnType<typeof getAccountsContext>;
	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._accountsContext = getAccountsContext();
		this.syncFromUrl(false);
		this.init();
	}

	syncFromUrl(shouldRefresh = true) {
		const currentUrl = this.currentUrl;
		const params = currentUrl.searchParams;
		this.currentListPath = currentUrl.pathname + currentUrl.search;

		this._customFromDate = null;
		this._customToDate = null;
		this._customLabel = null;
		this.period = 'last-3-months';
		this.kind = 'all';
		this.search = '';
		this.accountFilter = null;
		this.labelFilters = [];

		const sortParam = params.get('sort');
		const dirParam = params.get('dir');
		if (sortParam && isTransactionSortColumn(sortParam)) {
			this.sortColumn = sortParam;
			this.sortDirection = dirParam === 'asc' || dirParam === 'desc' ? dirParam : 'desc';
		} else {
			this.sortColumn = 'date';
			this.sortDirection = 'desc';
		}

		const periodFromParam = params.get('periodFrom');
		const periodToParam = params.get('periodTo');
		const periodLabelParam = params.get('periodLabel');

		if (periodFromParam && periodToParam) {
			const fromDate = this.parseDate(periodFromParam);
			const toDate = this.parseDate(periodToParam);

			if (fromDate && toDate && fromDate < toDate) {
				this._customFromDate = fromDate;
				this._customToDate = toDate;
				this._customLabel = periodLabelParam;
			}
		}

		if (this._customFromDate === null) {
			const periodParam = params.get('period');
			if (periodParam && this.periodOptions.includes(periodParam as PeriodOption)) {
				this.period = periodParam as PeriodOption;
			}
		}

		const amountParam = params.get('amount');
		if (amountParam && this.kindOptions.includes(amountParam as KindFilter)) {
			this.kind = amountParam as KindFilter;
		}

		const searchParam = params.get('q');
		if (searchParam) {
			this.search = searchParam;
		}

		const accountParam = params.get('account');
		if (accountParam) {
			const accounts = this._accountsContext.accounts;
			const isValid = accounts.length === 0 || accounts.some((a) => a.id === accountParam);
			if (isValid) {
				this.accountFilter = accountParam;
			}
		}

		const labelParams = params.getAll('label');
		if (labelParams.length > 0) {
			this.labelFilters = labelParams.filter(
				(id) =>
					this.transactionLabels.length === 0 || this.transactionLabels.some((l) => l.id === id)
			);
		}

		if (shouldRefresh) {
			this.page = 1;
			this.refreshTransactions();
		}
	}

	private parseDate(dateString: string) {
		const parsed = new UTCDate(dateString);
		if (isNaN(parsed.getTime())) {
			return null;
		}
		return parsed;
	}

	private updateUrl(params: SvelteURLSearchParams) {
		const currentUrl = this.currentUrl;
		const search = params.toString();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newUrl = new URL(currentUrl.href);
		newUrl.search = search;

		if (newUrl.href !== currentUrl.href) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			replaceState(newUrl.href, {});
		}
		this.currentListPath = newUrl.pathname + newUrl.search;
	}

	private get currentUrl() {
		if (browser) {
			return new URL(window.location.href);
		}

		return page.url;
	}

	private syncFiltersToParams(params: SvelteURLSearchParams) {
		if (this.kind === 'all') {
			params.delete('amount');
		} else {
			params.set('amount', this.kind);
		}
		if (this.accountFilter) {
			params.set('account', this.accountFilter);
		} else {
			params.delete('account');
		}
		params.delete('label');
		for (const labelId of this.labelFilters) {
			params.append('label', labelId);
		}
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._refreshSequence++;
			if (this._refreshTimer) {
				clearTimeout(this._refreshTimer);
				this._refreshTimer = null;
			}
			if (this._loadingDelayTimer) {
				clearTimeout(this._loadingDelayTimer);
				this._loadingDelayTimer = null;
			}
			this._activeUserId = userId;

			if (!userId) {
				this.rawTransactions = [];
				this.summaryTransactions = [];
				this.serverTotalItems = 0;
				this.transactionLabels = [];
				this.isLoading = false;
				return;
			}

			this.isLoading = true;
			queueMicrotask(() => {
				void this.refreshForCurrentUser(userId);
			});
		});
	}

	private async refreshForCurrentUser(userId: string) {
		this.realtimeSubscribe(userId);
		this.realtimeSubscribeLabels(userId);
		this.syncFromUrl(false);
		await this.refreshLabels(userId);
		if (userId !== this._activeUserId) return;
		await this.refreshTransactions(userId);
	}

	private async refreshLabels(userId = this._activeUserId) {
		if (!userId || userId !== this._activeUserId) return;

		try {
			const labels = await this._pb.authedClient
				.collection('transactionLabels')
				.getFullList<TransactionLabelsResponse>({
					sort: 'name',
					requestKey: null
				});
			if (userId !== this._activeUserId) return;
			this.transactionLabels = labels;
		} catch (error) {
			if (userId !== this._activeUserId) return;
			this._pb.handleConnectionError(error, 'transactionLabels', 'refresh');
		}
	}

	setSearch(query: string) {
		this.search = query;
		this.page = 1;
		this.syncSearchToUrl();

		if (this._searchDebounceTimer) {
			clearTimeout(this._searchDebounceTimer);
		}

		this._searchDebounceTimer = setTimeout(() => {
			this.refreshTransactions();
		}, TransactionsContext.SEARCH_DEBOUNCE_MS);
	}

	private syncSearchToUrl() {
		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);

		if (this.search.trim()) {
			params.set('q', this.search.trim());
		} else {
			params.delete('q');
		}

		this.updateUrl(params);
	}

	private escapeFilterValue(value: string) {
		return value.replace(/'/g, "''");
	}

	private get activeFilter() {
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
			filterParts.push(`date >= '${toPocketBaseDateString(from)}'`);
		}
		if (to) {
			filterParts.push(`date < '${toPocketBaseDateString(to)}'`);
		}

		if (this.kind === 'excluded') {
			filterParts.push('excluded != ""');
		} else if (this.kind === 'credits') {
			filterParts.push('excluded = ""');
		} else if (this.kind === 'debits') {
			filterParts.push('excluded = ""');
		}

		const searchQuery = this.search.trim();
		if (searchQuery) {
			filterParts.push(`description ~ '${this.escapeFilterValue(searchQuery)}'`);
		}

		if (this.accountFilter) {
			filterParts.push(`account = '${this.escapeFilterValue(this.accountFilter)}'`);
		}
		if (this.labelFilters.length > 0) {
			const labelClauses = this.labelFilters.map(
				(labelId) => `labels.id ?= '${this.escapeFilterValue(labelId)}'`
			);
			filterParts.push(`(${labelClauses.join(' || ')})`);
		}

		return filterParts.length > 0 ? filterParts.join(' && ') : undefined;
	}

	private get activeSort() {
		if (!this.sortColumn || !this.sortDirection) return '-date,-created,-id';

		const direction = this.sortDirection === 'desc' ? '-' : '';
		switch (this.sortColumn) {
			case 'amount':
				// NOTE: Displayed amounts are projected from frontend share perspective, so raw
				// `value` cannot be sorted server-side safely.
				return '-date,-created,-id';
			case 'description':
				return `${direction}description,${direction}date,${direction}id`;
			case 'account':
				return `${direction}account.name,${direction}date,${direction}id`;
			case 'date':
			default:
				return `${direction}date,${direction}created,${direction}id`;
		}
	}

	private get usesClientPagination() {
		return this.sortColumn === 'amount' || this.kind === 'credits' || this.kind === 'debits';
	}

	async refreshTransactions(userId = this._activeUserId, includeSummary = true) {
		if (userId && userId !== this._activeUserId) return;
		if (!userId) {
			this.rawTransactions = [];
			this.summaryTransactions = [];
			this.serverTotalItems = 0;
			this.isLoading = false;
			return;
		}
		const refreshId = this._refreshSequence;
		const pageRefreshId = ++this._pageRefreshSequence;
		const summaryRefreshId = includeSummary
			? ++this._summaryRefreshSequence
			: this._summaryRefreshSequence;

		if (this._loadingDelayTimer) {
			clearTimeout(this._loadingDelayTimer);
			this._loadingDelayTimer = null;
		}

		this._loadingDelayTimer = setTimeout(() => {
			if (
				userId !== this._activeUserId ||
				refreshId !== this._refreshSequence ||
				pageRefreshId !== this._pageRefreshSequence
			)
				return;
			this.isLoading = true;
		}, TransactionsContext.LOADING_DELAY_MS);

		try {
			const fields =
				'id,date,description,value,excluded,account,labels,expand.account.id,expand.account.name,expand.labels.id,expand.labels.name';
			const filter = this.activeFilter;
			const sort = this.activeSort;
			const usesClientPagination = this.usesClientPagination;
			if (includeSummary) {
				const summaryRequest = this._pb.authedClient
					.collection('transactions')
					.getFullList<TransactionsResponse<TransactionExpand>>({
						sort,
						expand: 'account,labels',
						fields,
						filter,
						batch: 200,
						requestKey: null
					});
				if (usesClientPagination) {
					const summaryList = await summaryRequest;
					if (
						userId !== this._activeUserId ||
						refreshId !== this._refreshSequence ||
						summaryRefreshId !== this._summaryRefreshSequence
					)
						return;
					this.summaryTransactions = summaryList;
					return;
				}
				const pageRequest = this._pb.authedClient
					.collection('transactions')
					.getList<TransactionsResponse<TransactionExpand>>(this.page, this.pageSize, {
						sort,
						expand: 'account,labels',
						fields,
						filter,
						requestKey: null
					});
				const [pageList, summaryList] = await Promise.all([pageRequest, summaryRequest]);
				if (
					userId !== this._activeUserId ||
					refreshId !== this._refreshSequence ||
					summaryRefreshId !== this._summaryRefreshSequence
				)
					return;
				if (pageRefreshId === this._pageRefreshSequence) {
					this.rawTransactions = pageList.items;
					this.serverTotalItems = pageList.totalItems;
				}
				this.summaryTransactions = summaryList;
				return;
			}
			if (usesClientPagination) return;
			const pageRequest = this._pb.authedClient
				.collection('transactions')
				.getList<TransactionsResponse<TransactionExpand>>(this.page, this.pageSize, {
					sort,
					expand: 'account,labels',
					fields,
					filter,
					requestKey: null
				});
			const pageList = await pageRequest;
			if (userId !== this._activeUserId || refreshId !== this._refreshSequence) return;
			if (pageRefreshId === this._pageRefreshSequence) {
				this.rawTransactions = pageList.items;
				this.serverTotalItems = pageList.totalItems;
			}
		} catch (error) {
			if (userId !== this._activeUserId || refreshId !== this._refreshSequence) return;
			if (
				pageRefreshId !== this._pageRefreshSequence &&
				(!includeSummary || summaryRefreshId !== this._summaryRefreshSequence)
			)
				return;
			this._pb.handleConnectionError(error, 'transactions', 'refresh');
		} finally {
			if (this._loadingDelayTimer) {
				clearTimeout(this._loadingDelayTimer);
				this._loadingDelayTimer = null;
			}
			if (
				userId === this._activeUserId &&
				refreshId === this._refreshSequence &&
				pageRefreshId === this._pageRefreshSequence
			)
				this.isLoading = false;
		}
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('transactions')
			.subscribe<TransactionsResponse<TransactionExpand>>('*', (event) =>
				this.onTransactionEvent(event, userId)
			)
			.then((unsubscribe) => {
				if (userId !== this._activeUserId) {
					unsubscribe();
					return;
				}
				this._unsubscribe = unsubscribe;
			})
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'transactions', 'subscribe_transactions');
				} else {
					console.error('[transactionsStore] Stale transaction subscription failed:', error);
				}
			});
		this._isSubscribed = true;
	}

	private realtimeSubscribeLabels(userId = this._activeUserId) {
		if (!userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('transactionLabels')
			.subscribe('*', () => this.refreshLabels(userId))
			.then((unsubscribe) => {
				if (userId !== this._activeUserId) {
					unsubscribe();
					return;
				}
				this._unsubscribeLabels = unsubscribe;
			})
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'transactionLabels', 'subscribe_labels');
				} else {
					console.error('[transactionsStore] Stale label subscription failed:', error);
				}
			});
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._unsubscribe?.();
		this._unsubscribe = null;
		this._unsubscribeLabels?.();
		this._unsubscribeLabels = null;
	}

	private onTransactionEvent(
		e: RecordSubscription<TransactionsResponse<TransactionExpand>>,
		userId: string
	) {
		if (!userId || userId !== this._activeUserId) return;

		if (!e.action) return;
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this._refreshTimer = setTimeout(() => {
			this._refreshTimer = null;
			if (userId !== this._activeUserId) return;
			this.refreshTransactions(userId).catch((error) =>
				this._pb.handleConnectionError(error, 'transactions', 'realtime_refresh')
			);
		}, TransactionsContext.REFRESH_DEBOUNCE_MS);
	}

	private getPeriodRange(option: PeriodOption) {
		const now = new UTCDate();
		const currentYear = now.getUTCFullYear();
		const currentMonth = now.getUTCMonth();
		const startOfThisMonth = new UTCDate(currentYear, currentMonth, 1, 0, 0, 0, 0);

		switch (option) {
			case 'this-month': {
				return { from: startOfThisMonth, to: null } as const;
			}
			case 'last-month': {
				const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
				const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
				const startOfLastMonth = new UTCDate(lastMonthYear, lastMonth, 1, 0, 0, 0, 0);
				return { from: startOfLastMonth, to: startOfThisMonth } as const;
			}
			case 'last-3-months': {
				const threeMonthsAgo = new UTCDate(currentYear, currentMonth - 2, 1, 0, 0, 0, 0);
				return { from: threeMonthsAgo, to: null } as const;
			}
			case 'last-6-months': {
				const sixMonthsAgo = new UTCDate(currentYear, currentMonth - 5, 1, 0, 0, 0, 0);
				return { from: sixMonthsAgo, to: null } as const;
			}
			case 'last-12-months': {
				const twelveMonthsAgo = new UTCDate(currentYear, currentMonth - 11, 1, 0, 0, 0, 0);
				return { from: twelveMonthsAgo, to: null } as const;
			}
			case 'year-to-date': {
				const startOfYearUtc = new UTCDate(currentYear, 0, 1, 0, 0, 0, 0);
				return { from: startOfYearUtc, to: null } as const;
			}
			case 'last-year': {
				const startOfLastYear = new UTCDate(currentYear - 1, 0, 1, 0, 0, 0, 0);
				const startOfThisYear = new UTCDate(currentYear, 0, 1, 0, 0, 0, 0);
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

	private mapTransactions(transactions: TransactionsResponse<TransactionExpand>[]) {
		return transactions.map((txn) => {
			const dateIso = txn.date;
			const date = new Date(dateIso);
			const expandedAccount = txn.expand?.account;
			const contextAccount = this._accountsContext.getAccount(txn.account);
			const accountName =
				contextAccount?.name ??
				expandedAccount?.name ??
				this.accountNameById.get(txn.account) ??
				'';
			const expandedLabels = txn.expand?.labels ?? [];
			const dateValue = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
			const labelChips = expandedLabels
				.filter((label): label is typeof label & { name: string } => Boolean(label.name))
				.map((label) => ({ id: label.id, name: label.name }))
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
			const labelNames = labelChips.map((label) => label.name);
			const labelIds = txn.labels ?? [];
			const rawValue = txn.value ?? 0;
			const value = contextAccount?.perspective === 'INVERSE' ? -rawValue : rawValue;
			return {
				id: txn.id,
				date,
				dateIso,
				dateValue,
				description: (txn.description ?? '').trim(),
				labelIds,
				labels: labelNames,
				labelChips,
				accountName,
				accountId: txn.account ?? null,
				accountIsShared: Boolean(contextAccount?.isShared),
				value,
				hasProjectedValue: Boolean(contextAccount),
				excluded: Boolean(txn.excluded)
			};
		});
	}

	get allRows() {
		return this.mapTransactions(this.summaryTransactions);
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
		const filtered = this.allRows.filter((row) => {
			const time = row.dateValue;
			if (fromTime !== null && time < fromTime) return false;
			if (toTime !== null && time >= toTime) return false;
			if (this.accountFilter && row.accountId !== this.accountFilter) return false;
			if (
				this.labelFilters.length > 0 &&
				!this.labelFilters.some((labelId) => row.labelIds.includes(labelId))
			)
				return false;
			if (this.kind === 'credits') return row.hasProjectedValue && row.value > 0 && !row.excluded;
			if (this.kind === 'debits') return row.hasProjectedValue && row.value < 0 && !row.excluded;
			if (this.kind === 'excluded') return row.excluded;
			return true;
		});

		if (this.sortColumn && this.sortDirection) {
			const comparator = createSortComparator<TransactionRow, TransactionSortColumn>(
				this.sortState,
				{
					date: (r) => r.dateValue,
					description: (r) => r.description,
					account: (r) => r.accountName,
					amount: (r) => r.value
				}
			);
			return filtered.sort(comparator);
		}

		return filtered.sort((a, b) => {
			if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
			if (b.value !== a.value) return b.value - a.value;
			return a.id.localeCompare(b.id);
		});
	}

	get totalPages() {
		const total = this.totalItems;
		if (total === 0) return 1;
		return Math.ceil(total / this.pageSize);
	}

	get totalItems() {
		return this.usesClientPagination ? this.filteredRows.length : this.serverTotalItems;
	}

	get paginatedRows() {
		if (this.usesClientPagination) {
			const start = (this.page - 1) * this.pageSize;
			return this.filteredRows.slice(start, start + this.pageSize);
		}
		return this.mapTransactions(this.rawTransactions);
	}

	get netBalance() {
		return this.filteredRows
			.filter((row) => !row.excluded)
			.reduce((sum, row) => sum + row.value, 0);
	}

	get customFromDate() {
		return this._customFromDate;
	}

	get customToDate() {
		return this._customToDate;
	}

	get customLabel() {
		return this._customLabel;
	}

	get isCustomRange() {
		return this._customFromDate !== null && this._customToDate !== null;
	}

	get customRange(): { from: Date; to: Date; label: string | null } | null {
		if (this._customFromDate && this._customToDate) {
			return { from: this._customFromDate, to: this._customToDate, label: this._customLabel };
		}
		return null;
	}

	setCustomRange(from: Date, to: Date) {
		this._customFromDate = from;
		this._customToDate = to;
		this._customLabel = null;

		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);

		params.delete('period');
		params.set('periodFrom', toPocketBaseDateString(from).split(' ')[0]);
		params.set('periodTo', toPocketBaseDateString(to).split(' ')[0]);
		params.delete('periodLabel');

		this.updateUrl(params);
		this.page = 1;
		this.refreshTransactions();
	}

	setPresetPeriod(option: PeriodOption) {
		this._customFromDate = null;
		this._customToDate = null;
		this._customLabel = null;
		this.period = option;

		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);

		params.delete('periodFrom');
		params.delete('periodTo');
		params.delete('periodLabel');
		params.set('period', option);
		this.syncFiltersToParams(params);

		this.updateUrl(params);
		this.page = 1;
		this.refreshTransactions();
	}

	setKind(option: KindFilter) {
		this.kind = option;
		this.page = 1;

		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);
		this.syncFiltersToParams(params);

		this.updateUrl(params);
		this.refreshTransactions();
	}

	setAccountFilter(accountId: string | null) {
		this.accountFilter = accountId;
		this.page = 1;

		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);
		this.syncFiltersToParams(params);

		this.updateUrl(params);
		this.refreshTransactions();
	}

	private applyLabelFilters(labelIds: string[]) {
		this.labelFilters = labelIds;
		this.page = 1;

		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);
		this.syncFiltersToParams(params);

		this.updateUrl(params);
		this.refreshTransactions();
	}

	toggleLabelFilter(labelId: string) {
		const next = this.labelFilters.includes(labelId)
			? this.labelFilters.filter((id) => id !== labelId)
			: [...this.labelFilters, labelId];
		this.applyLabelFilters(next);
	}

	setLabelFilters(labelIds: string[]) {
		this.applyLabelFilters(labelIds);
	}

	clearLabelFilters() {
		this.applyLabelFilters([]);
	}

	get sortState(): SortState<TransactionSortColumn> {
		return { column: this.sortColumn, direction: this.sortDirection };
	}

	setSort(column: string) {
		if (!isTransactionSortColumn(column)) return;
		if (this.sortColumn !== column) {
			this.sortColumn = column;
			this.sortDirection = 'desc';
		} else if (this.sortDirection === 'desc') {
			this.sortDirection = 'asc';
		} else {
			this.sortDirection = 'desc';
		}
		this.page = 1;

		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);
		params.set('sort', this.sortColumn);
		params.set('dir', this.sortDirection);

		this.updateUrl(params);
		this.refreshTransactions();
	}

	setPage(page: number) {
		const nextPage = Math.min(Math.max(1, page), this.totalPages);
		if (nextPage === this.page) return;
		this.page = nextPage;
		if (this.usesClientPagination) return;
		this.refreshTransactions(this._activeUserId, false);
	}

	get selectedIds() {
		return this._selectedIds;
	}

	get selectedCount() {
		return this._selectedIds.size;
	}

	get isAllVisibleSelected() {
		if (this.paginatedRows.length === 0) return false;
		return this.paginatedRows.every((row) => this._selectedIds.has(row.id));
	}

	get isIndeterminate() {
		if (this._selectedIds.size === 0) return false;
		if (this.isAllVisibleSelected) return false;
		return this.paginatedRows.some((row) => this._selectedIds.has(row.id));
	}

	get selectedTransactions() {
		return this.allRows.filter((row) => this._selectedIds.has(row.id));
	}

	toggleSelection(id: string) {
		if (this._selectedIds.has(id)) {
			this._selectedIds.delete(id);
		} else {
			this._selectedIds.add(id);
		}
	}

	selectAllVisible() {
		for (const row of this.paginatedRows) {
			this._selectedIds.add(row.id);
		}
	}

	deselectAllVisible() {
		for (const row of this.paginatedRows) {
			this._selectedIds.delete(row.id);
		}
	}

	clearSelection() {
		this._selectedIds.clear();
	}

	get filteredCount() {
		return this.filteredRows.length;
	}

	get isAllFilteredSelected() {
		if (this.filteredRows.length === 0) return false;
		return this.filteredRows.every((row) => this._selectedIds.has(row.id));
	}

	selectAllFiltered() {
		for (const row of this.filteredRows) {
			this._selectedIds.add(row.id);
		}
	}

	dispose() {
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
		if (this._loadingDelayTimer) clearTimeout(this._loadingDelayTimer);
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this.unsubscribeRealtime();
	}
}

const CONTEXT_KEY_TRANSACTIONS = 'transactions';

export function setTransactionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_TRANSACTIONS, new TransactionsContext(pb));
}

export function getTransactionsContext() {
	return getContext<ReturnType<typeof setTransactionsContext>>(CONTEXT_KEY_TRANSACTIONS);
}
