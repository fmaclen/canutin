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
import { getSecuritiesContext } from './securities.svelte';
import type { PeriodOption } from './transactions.svelte';
import { toNumber, toPocketBaseDateString } from './utils';

type TradeExpand = {
	account?: AccountsResponse;
	security?: SecuritiesResponse;
};

type Trade = SecurityTransactionsResponse<number, number, number, number, TradeExpand>;

export type TradeTypeFilter = 'all' | SecurityTransactionsTypeOptions;

export type TradeRow = {
	id: string;
	date: Date;
	dateValue: number;
	securityId: string | null;
	securityName: string;
	securitySymbol: string | null;
	securityCurrency: string;
	type: SecurityTransactionsTypeOptions;
	subtype: string;
	description: string;
	accountId: string | null;
	accountName: string;
	accountIsShared: boolean;
	quantity: number | null;
	price: number | null;
	amount: number | null;
	fees: number | null;
};

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
	private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
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
	readonly typeOptions = Object.values(SecurityTransactionsTypeOptions);
	readonly pageSize = 50;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
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

	setSearch(query: string) {
		this.search = query;
		this.page = 1;
		this.syncFiltersToUrl();

		if (this._searchDebounceTimer) {
			clearTimeout(this._searchDebounceTimer);
		}

		this._searchDebounceTimer = setTimeout(() => {
			this.refreshTransactions();
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
		this.refreshTransactions();
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

	setAccountFilter(accountId: string | null) {
		this.accountFilter = accountId;
		this.page = 1;
		this.syncFiltersToUrl();
		this.refreshTransactions();
	}

	setSecurityFilter(securityId: string | null) {
		this.securityFilter = securityId;
		this.page = 1;
		this.syncFiltersToUrl();
		this.refreshTransactions();
	}

	setTypeFilter(type: TradeTypeFilter) {
		this.typeFilter = type;
		this.page = 1;
		this.syncFiltersToUrl();
		this.refreshTransactions();
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

	async refreshTransactions(userId = this._activeUserId, includeSummary = true) {
		if (userId && userId !== this._activeUserId) return;
		if (!userId) {
			this.rawTransactions = [];
			this.summaryTransactions = [];
			this.totalItems = 0;
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
		}, TradesContext.LOADING_DELAY_MS);

		try {
			const fields =
				'id,date,security,type,subtype,description,name,account,quantity,price,amount,fees,expand.account.id,expand.account.name,expand.security.id,expand.security.name,expand.security.symbol,expand.security.currency';
			const filter = this.activeFilter;
			if (includeSummary) {
				const requestedPage = this.page;
				const summaryList = await this._pb.authedClient
					.collection('securityTransactions')
					.getFullList<Trade>({
						sort: '-date,-created,-id',
						expand: 'account,security',
						fields,
						filter,
						batch: 200,
						requestKey: null
					});
				if (
					userId !== this._activeUserId ||
					refreshId !== this._refreshSequence ||
					summaryRefreshId !== this._summaryRefreshSequence
				)
					return;
				if (pageRefreshId === this._pageRefreshSequence) {
					const start = (requestedPage - 1) * this.pageSize;
					this.rawTransactions = summaryList.slice(start, start + this.pageSize);
					this.totalItems = summaryList.length;
				}
				this.summaryTransactions = summaryList;
				return;
			}
			const pageRequest = this._pb.authedClient
				.collection('securityTransactions')
				.getList<Trade>(this.page, this.pageSize, {
					sort: '-date,-created,-id',
					expand: 'account,security',
					fields,
					filter,
					requestKey: null
				});
			const pageList = await pageRequest;
			if (userId !== this._activeUserId || refreshId !== this._refreshSequence) return;
			if (pageRefreshId === this._pageRefreshSequence) {
				this.rawTransactions = pageList.items;
				this.totalItems = pageList.totalItems;
			}
		} catch (error) {
			if (userId !== this._activeUserId || refreshId !== this._refreshSequence) return;
			if (
				pageRefreshId !== this._pageRefreshSequence &&
				(!includeSummary || summaryRefreshId !== this._summaryRefreshSequence)
			)
				return;
			this._pb.handleConnectionError(error, 'securityTransactions', 'refresh');
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
				this.totalItems = 0;
				this.isLoading = false;
				return;
			}

			this.isLoading = true;
			queueMicrotask(() => {
				if (userId !== this._activeUserId) return;
				this.realtimeSubscribe(userId);
				this.syncFromUrl(false);
				void this.refreshTransactions(userId);
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

	private onTradeEvent(event: RecordSubscription<Trade>, userId: string) {
		if (!userId || userId !== this._activeUserId) return;

		if (!event.action) return;
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this._refreshTimer = setTimeout(() => {
			this._refreshTimer = null;
			if (userId !== this._activeUserId) return;
			this.refreshTransactions(userId).catch((error) =>
				this._pb.handleConnectionError(error, 'securityTransactions', 'realtime_refresh')
			);
		}, TradesContext.REFRESH_DEBOUNCE_MS);
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

	get isCustomRange() {
		return this._customFromDate !== null && this._customToDate !== null;
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
		this.refreshTransactions(this._activeUserId, false);
	}

	dispose() {
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
		if (this._loadingDelayTimer) clearTimeout(this._loadingDelayTimer);
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this.unsubscribeRealtime();
	}
}

const CONTEXT_KEY_TRADES = 'trades';

export function setTradesContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_TRADES, new TradesContext(pb));
}

export function getTradesContext() {
	return getContext<ReturnType<typeof setTradesContext>>(CONTEXT_KEY_TRADES);
}
