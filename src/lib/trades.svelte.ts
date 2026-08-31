import { UTCDate } from '@date-fns/utc';
import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteURLSearchParams } from 'svelte/reactivity';

import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';

import { getAccountsContext } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import { logError } from './logger';
import {
	SecurityTransactionsTypeOptions,
	type AccountsResponse,
	type SecuritiesResponse,
	type SecurityTransactionsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { StaleSync } from './realtime-sync';
import { getSecuritiesContext } from './securities.svelte';
import type { PeriodOption } from './transactions.svelte';
import { toNumber, toPocketBaseDateString } from './utils';

const TRADE_FIELDS =
	'id,date,security,type,subtype,description,name,account,quantity,price,amount,fees,expand.account.id,expand.account.name,expand.security.id,expand.security.name,expand.security.symbol,expand.security.currency';

type TradeExpand = {
	account?: AccountsResponse;
	security?: SecuritiesResponse;
};

type Trade = SecurityTransactionsResponse<number, number, number, number, TradeExpand>;

export type TradeTypeFilter = 'all' | SecurityTransactionsTypeOptions;

class TradesContext {
	period: PeriodOption = $state('last-3-months');
	search: string = $state('');
	accountFilter: string | null = $state(null);
	securityFilter: string | null = $state(null);
	typeFilter: TradeTypeFilter = $state('all');
	page: number = $state(1);
	isLoading: boolean = $state(true);
	rawTransactions: Trade[] = $state([]);
	summaryTransactions: Trade[] = $state([]);
	totalItems: number = $state(0);

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _accountsContext: ReturnType<typeof getAccountsContext>;
	private _securitiesContext: ReturnType<typeof getSecuritiesContext>;
	private _customFromDate: Date | null = $state(null);
	private _customToDate: Date | null = $state(null);
	private _customLabel: string | null = $state(null);
	private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _loadingDelayTimer: ReturnType<typeof setTimeout> | null = null;
	private sync: StaleSync;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	// Latest-wins guards for the two result slots a refresh commits into. They are separate because a
	// page-only refetch must not discard an in-flight full refresh's summary commit.
	private _pageRefreshSequence = 0;
	private _summaryRefreshSequence = 0;

	private static readonly LOADING_DELAY_MS = 150;
	private static readonly SEARCH_DEBOUNCE_MS = 300;

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
	readonly typeOptions = Object.values(SecurityTransactionsTypeOptions);
	readonly pageSize = 50;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this.sync = new StaleSync(pb, 'securityTransactions', 'refresh', (token) =>
			this.refreshTransactions(token)
		);
		this._pb.registerRealtimeSync(this.sync);
		this._accountsContext = getAccountsContext();
		this._securitiesContext = getSecuritiesContext();
		this.syncFromUrl(false);
		this.init();
	}

	syncFromUrl(shouldRefresh = true) {
		const params = this.currentUrl.searchParams;
		this._customFromDate = null;
		this._customToDate = null;
		this._customLabel = null;
		this.period = 'last-3-months';
		this.search = '';
		this.accountFilter = null;
		this.securityFilter = null;
		this.typeFilter = 'all';

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

		const searchParam = params.get('q');
		if (searchParam) {
			this.search = searchParam;
		}

		const accountParam = params.get('account');
		if (accountParam) {
			if (this._accountsContext.accounts.some((account) => account.id === accountParam)) {
				this.accountFilter = accountParam;
			}
		}

		const securityParam = params.get('security');
		if (securityParam) {
			const securities = this._securitiesContext.securities;
			if (securities.some((security) => security.id === securityParam)) {
				this.securityFilter = securityParam;
			}
		}

		const typeParam = params.get('type');
		if (typeParam && this.typeOptions.includes(typeParam as SecurityTransactionsTypeOptions)) {
			this.typeFilter = typeParam as SecurityTransactionsTypeOptions;
		}

		if (shouldRefresh) {
			this.page = 1;
			void this.sync.refreshNow();
		}
	}

	private parseDate(dateString: string) {
		const parsed = new UTCDate(dateString);
		if (isNaN(parsed.getTime())) {
			return null;
		}
		return parsed;
	}

	setSearch(query: string) {
		this.search = query;
		this.page = 1;
		this.syncFiltersToUrl();

		if (this._searchDebounceTimer) {
			clearTimeout(this._searchDebounceTimer);
		}

		this._searchDebounceTimer = setTimeout(() => {
			void this.sync.refreshNow();
		}, TradesContext.SEARCH_DEBOUNCE_MS);
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

		this.updateUrl(params);
		this.page = 1;
		void this.sync.refreshNow();
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
		void this.sync.refreshNow();
	}

	setAccountFilter(accountId: string | null) {
		this.accountFilter = accountId;
		this.page = 1;
		this.syncFiltersToUrl();
		void this.sync.refreshNow();
	}

	setSecurityFilter(securityId: string | null) {
		this.securityFilter = securityId;
		this.page = 1;
		this.syncFiltersToUrl();
		void this.sync.refreshNow();
	}

	setTypeFilter(type: TradeTypeFilter) {
		this.typeFilter = type;
		this.page = 1;
		this.syncFiltersToUrl();
		void this.sync.refreshNow();
	}

	private escapeFilterValue(value: string) {
		return value.replace(/'/g, "''");
	}

	private get activeFilter() {
		const filterParts: string[] = [];

		const { from, to } = this.activeDateRange;
		if (from) {
			filterParts.push(`date >= '${toPocketBaseDateString(from)}'`);
		}
		if (to) {
			filterParts.push(`date < '${toPocketBaseDateString(to)}'`);
		}

		if (this.accountFilter) {
			filterParts.push(`account = '${this.escapeFilterValue(this.accountFilter)}'`);
		}
		if (this.securityFilter) {
			filterParts.push(`security = '${this.escapeFilterValue(this.securityFilter)}'`);
		}
		if (this.typeFilter !== 'all') {
			filterParts.push(`type = '${this.escapeFilterValue(this.typeFilter)}'`);
		}

		const searchQuery = this.search.trim();
		if (searchQuery) {
			const escaped = this.escapeFilterValue(searchQuery);
			filterParts.push(
				`(description ~ '${escaped}' || name ~ '${escaped}' || subtype ~ '${escaped}' || type ~ '${escaped}' || security.name ~ '${escaped}' || security.symbol ~ '${escaped}' || account.name ~ '${escaped}')`
			);
		}

		return filterParts.length > 0 ? filterParts.join(' && ') : undefined;
	}

	// The spinner only appears if a refresh is still running after a beat, so a fast refetch doesn't
	// flash it. The delayed flip is dropped once a newer refresh has taken over.
	private startLoadingDelay(userId: string, token: number, pageRefreshId: number) {
		this.clearLoadingDelay();
		this._loadingDelayTimer = setTimeout(() => {
			if (
				userId !== this._activeUserId ||
				!this.sync.isCurrent(token) ||
				pageRefreshId !== this._pageRefreshSequence
			)
				return;
			this.isLoading = true;
		}, TradesContext.LOADING_DELAY_MS);
	}

	private clearLoadingDelay() {
		if (this._loadingDelayTimer) clearTimeout(this._loadingDelayTimer);
		this._loadingDelayTimer = null;
	}

	// A full refresh fills both result slots from one full-list query - the page is a slice of it.
	// Errors propagate to the sync, which keeps the store marked stale and retries until one commits.
	private async refreshTransactions(token: number) {
		const userId = this._activeUserId;
		if (!userId) {
			this.rawTransactions = [];
			this.summaryTransactions = [];
			this.totalItems = 0;
			this.isLoading = false;
			return;
		}
		const pageRefreshId = ++this._pageRefreshSequence;
		const summaryRefreshId = ++this._summaryRefreshSequence;
		this.startLoadingDelay(userId, token, pageRefreshId);

		try {
			const requestedPage = this.page;
			const summaryList = await this._pb.authedClient
				.collection('securityTransactions')
				.getFullList<Trade>({
					sort: '-date,-created,-id',
					expand: 'account,security',
					fields: TRADE_FIELDS,
					filter: this.activeFilter,
					batch: 200,
					requestKey: null
				});
			if (
				userId !== this._activeUserId ||
				!this.sync.isCurrent(token) ||
				summaryRefreshId !== this._summaryRefreshSequence
			)
				return;
			if (pageRefreshId === this._pageRefreshSequence) {
				const start = (requestedPage - 1) * this.pageSize;
				this.rawTransactions = summaryList.slice(start, start + this.pageSize);
				this.totalItems = summaryList.length;
			}
			this.summaryTransactions = summaryList;
		} finally {
			this.clearLoadingDelay();
			if (
				userId === this._activeUserId &&
				this.sync.isCurrent(token) &&
				pageRefreshId === this._pageRefreshSequence
			)
				this.isLoading = false;
		}
	}

	// A page change refetches only the page slot: the summary already spans the whole filtered range,
	// so re-running its full-list query on every page click would be pure waste. Paging is a user
	// action rather than a sync signal, so it stays outside the staleness ladder.
	private async refreshPage() {
		const userId = this._activeUserId;
		const token = this.sync.current;
		const pageRefreshId = ++this._pageRefreshSequence;
		this.startLoadingDelay(userId, token, pageRefreshId);

		try {
			const pageList = await this._pb.authedClient
				.collection('securityTransactions')
				.getList<Trade>(this.page, this.pageSize, {
					sort: '-date,-created,-id',
					expand: 'account,security',
					fields: TRADE_FIELDS,
					filter: this.activeFilter,
					requestKey: null
				});
			if (
				userId !== this._activeUserId ||
				!this.sync.isCurrent(token) ||
				pageRefreshId !== this._pageRefreshSequence
			)
				return;
			this.rawTransactions = pageList.items;
			this.totalItems = pageList.totalItems;
		} catch (error) {
			if (
				userId !== this._activeUserId ||
				!this.sync.isCurrent(token) ||
				pageRefreshId !== this._pageRefreshSequence
			)
				return;
			this._pb.handleConnectionError(error, 'securityTransactions', 'page');
		} finally {
			this.clearLoadingDelay();
			if (
				userId === this._activeUserId &&
				this.sync.isCurrent(token) &&
				pageRefreshId === this._pageRefreshSequence
			)
				this.isLoading = false;
		}
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.sync.cancel();
			this.clearLoadingDelay();
			this._activeUserId = userId;

			if (!userId) {
				this.rawTransactions = [];
				this.summaryTransactions = [];
				this.totalItems = 0;
				this.isLoading = false;
				return;
			}

			this.isLoading = true;
			queueMicrotask(() => {
				if (userId !== this._activeUserId) return;
				this.realtimeSubscribe(userId);
				this.syncFromUrl(false);
				void this.sync.refreshNow();
			});
		});
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('securityTransactions')
			.subscribe<Trade>('*', (event) => this.onTradeEvent(event, userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'securityTransactions', 'subscribe_transactions');
				} else {
					logError('tradesStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('securityTransactions').unsubscribe('*');
	}

	// A trade event or a realtime reconnect is a pure invalidation signal: it marks the store stale
	// and schedules the page/summary refetch rather than patching the payload into the cached rows.
	private onTradeEvent(event: RecordSubscription<Trade>, userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		if (!event.action) return;
		this.sync.invalidate();
	}

	private get currentUrl() {
		if (browser) {
			return new URL(window.location.href);
		}

		return page.url;
	}

	private syncFiltersToUrl() {
		const params = new SvelteURLSearchParams(this.currentUrl.searchParams);

		if (this.search.trim()) {
			params.set('q', this.search.trim());
		} else {
			params.delete('q');
		}
		if (this.accountFilter) {
			params.set('account', this.accountFilter);
		} else {
			params.delete('account');
		}
		if (this.securityFilter) {
			params.set('security', this.securityFilter);
		} else {
			params.delete('security');
		}
		if (this.typeFilter === 'all') {
			params.delete('type');
		} else {
			params.set('type', this.typeFilter);
		}

		this.updateUrl(params);
	}

	private updateUrl(params: SvelteURLSearchParams) {
		const currentUrl = this.currentUrl;
		const search = params.toString();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newUrl = new URL(currentUrl.href);
		newUrl.search = search;

		if (newUrl.href !== currentUrl.href) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- URL is rebuilt from the current browser URL and dynamic filters.
			replaceState(newUrl.href, {});
		}
	}

	get customRange(): { from: Date; to: Date; label: string | null } | null {
		if (this._customFromDate && this._customToDate) {
			return { from: this._customFromDate, to: this._customToDate, label: this._customLabel };
		}
		return null;
	}

	private get activeDateRange() {
		if (this._customFromDate !== null || this._customToDate !== null) {
			return { from: this._customFromDate, to: this._customToDate };
		}
		return this.getPeriodRange(this.period);
	}

	private getPeriodRange(option: PeriodOption) {
		// NOTE: Read LOCAL date components, not UTC, so presets match the calendar grid and the
		// picker's date-only storage; UTC drifts a month at boundaries (Tokyo July 1 vs UTC June 30).
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth();
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

	get allRows() {
		return this.mapTransactions(this.summaryTransactions);
	}

	private mapTransactions(transactions: Trade[]) {
		return transactions.map((transaction) => {
			const date = new Date(transaction.date);
			const dateValue = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
			const account = this._accountsContext.getAccount(transaction.account);
			const expandedAccount = transaction.expand?.account;
			const security = this._securitiesContext.getSecurity(transaction.security);
			const expandedSecurity = transaction.expand?.security;
			const accountName = account?.name ?? expandedAccount?.name ?? '';

			return {
				id: transaction.id,
				date,
				dateValue,
				securityId: transaction.security || null,
				securityName: expandedSecurity?.name ?? '',
				securitySymbol: expandedSecurity?.symbol || null,
				securityCurrency: security?.currency ?? expandedSecurity?.currency ?? 'USD',
				type: transaction.type,
				subtype: transaction.subtype ?? '',
				description: (transaction.description || transaction.name || '').trim(),
				accountId: transaction.account || null,
				accountName,
				accountIsShared: Boolean(account?.isShared),
				quantity: toNumber(transaction.quantity),
				price: toNumber(transaction.price),
				amount: toNumber(transaction.amount),
				fees: toNumber(transaction.fees)
			};
		});
	}

	get filteredRows() {
		const { from, to } = this.activeDateRange;
		const fromTime = from?.getTime() ?? null;
		const toTime = to?.getTime() ?? null;
		const query = this.search.trim().toLocaleLowerCase();

		const rows = this.allRows.filter((row) => {
			const time = row.dateValue;
			if (fromTime !== null && time < fromTime) return false;
			if (toTime !== null && time >= toTime) return false;
			if (this.accountFilter && row.accountId !== this.accountFilter) return false;
			if (this.securityFilter && row.securityId !== this.securityFilter) return false;
			if (this.typeFilter !== 'all' && row.type !== this.typeFilter) return false;
			if (!query) return true;
			return [
				row.securityName,
				row.securitySymbol,
				row.type,
				row.subtype,
				row.description,
				row.accountName
			]
				.filter((value): value is string => Boolean(value))
				.some((value) => value.toLocaleLowerCase().includes(query));
		});

		return rows.sort((a, b) => {
			if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
			return a.id.localeCompare(b.id);
		});
	}

	get totalPages() {
		const total = this.totalItems;
		if (total === 0) return 1;
		return Math.ceil(total / this.pageSize);
	}

	get paginatedRows() {
		return this.mapTransactions(this.rawTransactions);
	}

	setPage(page: number) {
		const nextPage = Math.min(Math.max(1, page), this.totalPages);
		if (nextPage === this.page) return;
		this.page = nextPage;
		void this.refreshPage();
	}

	dispose() {
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeSync(this.sync);
		if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
		this.clearLoadingDelay();
		this.sync.cancel();
		this.unsubscribeRealtime();
	}
}

export function setTradesContext(pb: PocketBaseContext) {
	return setContext('trades', new TradesContext(pb));
}

export function getTradesContext() {
	return getContext<ReturnType<typeof setTradesContext>>('trades');
}
