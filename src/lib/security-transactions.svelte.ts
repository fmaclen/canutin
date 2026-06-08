import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteURLSearchParams } from 'svelte/reactivity';
import { get } from 'svelte/store';

import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { page } from '$app/stores';

import { getAccountsContext } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import {
	SecurityTransactionsTypeOptions,
	type AccountsResponse,
	type SecuritiesResponse,
	type SecurityTransactionsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

type SecurityTransactionExpand = {
	account?: AccountsResponse;
	security?: SecuritiesResponse;
};

type SecurityTransaction = SecurityTransactionsResponse<
	number,
	number,
	number,
	number,
	SecurityTransactionExpand
>;

export type SecurityTransactionTypeFilter = 'all' | SecurityTransactionsTypeOptions;

export type SecurityTransactionRow = {
	id: string;
	date: Date;
	dateIso: string;
	dateValue: number;
	securityId: string | null;
	securityName: string;
	securitySymbol: string | null;
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

class SecurityTransactionsContext {
	search: string = $state('');
	accountFilter: string | null = $state(null);
	securityFilter: string | null = $state(null);
	typeFilter: SecurityTransactionTypeFilter = $state('all');
	isLoading: boolean = $state(true);
	rawTransactions: SecurityTransaction[] = $state([]);

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _accountsContext: ReturnType<typeof getAccountsContext>;
	private _loadingDelayTimer: ReturnType<typeof setTimeout> | null = null;
	private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private _activeUserId = '';
	private _isSubscribed = false;

	private static readonly LOADING_DELAY_MS = 150;

	readonly typeOptions = Object.values(SecurityTransactionsTypeOptions);

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._accountsContext = getAccountsContext();
		this.syncFromUrl(false);
		this.init();
	}

	syncFromUrl(shouldRefresh = true) {
		const params = this.currentUrl.searchParams;
		this.search = '';
		this.accountFilter = null;
		this.securityFilter = null;
		this.typeFilter = 'all';

		const searchParam = params.get('q');
		if (searchParam) {
			this.search = searchParam;
		}

		const accountParam = params.get('account');
		if (accountParam) {
			const accounts = this.securityAccounts;
			if (accounts.some((account) => account.id === accountParam)) {
				this.accountFilter = accountParam;
			}
		}

		const securityParam = params.get('security');
		if (securityParam) {
			this.securityFilter = securityParam;
		}

		const typeParam = params.get('type');
		if (typeParam && this.typeOptions.includes(typeParam as SecurityTransactionsTypeOptions)) {
			this.typeFilter = typeParam as SecurityTransactionsTypeOptions;
		}

		if (shouldRefresh) this.refreshTransactions();
	}

	get securityAccounts() {
		return this._accountsContext.accounts;
	}

	setSearch(query: string) {
		this.search = query;
		this.syncFiltersToUrl();
	}

	setAccountFilter(accountId: string | null) {
		this.accountFilter = accountId;
		this.syncFiltersToUrl();
		this.refreshTransactions();
	}

	setSecurityFilter(securityId: string | null) {
		this.securityFilter = securityId;
		this.syncFiltersToUrl();
		this.refreshTransactions();
	}

	setTypeFilter(type: SecurityTransactionTypeFilter) {
		this.typeFilter = type;
		this.syncFiltersToUrl();
		this.refreshTransactions();
	}

	async refreshTransactions() {
		if (!this._activeUserId) {
			this.rawTransactions = [];
			this.isLoading = false;
			return;
		}

		if (this._loadingDelayTimer) {
			clearTimeout(this._loadingDelayTimer);
			this._loadingDelayTimer = null;
		}

		this._loadingDelayTimer = setTimeout(() => {
			this.isLoading = true;
		}, SecurityTransactionsContext.LOADING_DELAY_MS);

		try {
			const filterParts: string[] = [];
			if (this.accountFilter) {
				filterParts.push(`account = '${this.accountFilter}'`);
			}
			if (this.securityFilter) {
				filterParts.push(`security = '${this.securityFilter}'`);
			}
			if (this.typeFilter !== 'all') {
				filterParts.push(`type = '${this.typeFilter}'`);
			}

			const filter = filterParts.length > 0 ? filterParts.join(' && ') : undefined;
			this.rawTransactions = await this._pb.authedClient
				.collection('securityTransactions')
				.getFullList<SecurityTransaction>({
					sort: '-date,-created,-id',
					expand: 'account,security',
					batch: 200,
					filter,
					requestKey: null
				});
		} catch (error) {
			this._pb.handleConnectionError(error, 'securityTransactions', 'refresh');
		} finally {
			if (this._loadingDelayTimer) {
				clearTimeout(this._loadingDelayTimer);
				this._loadingDelayTimer = null;
			}
			this.isLoading = false;
		}
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this._activeUserId = userId;

			if (!userId) {
				this.unsubscribeRealtime();
				this.rawTransactions = [];
				this.isLoading = false;
				return;
			}

			this.isLoading = true;
			queueMicrotask(() => {
				if (userId !== this._activeUserId) return;
				this.realtimeSubscribe();
				this.syncFromUrl(false);
				void this.refreshTransactions();
			});
		});
	}

	private realtimeSubscribe() {
		if (this._isSubscribed || !this._activeUserId) return;

		this._pb.authedClient
			.collection('securityTransactions')
			.subscribe('*', this.onTransactionEvent.bind(this))
			.catch((error) => {
				if (this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'securityTransactions', 'subscribe_transactions');
				}
			});
		this._isSubscribed = true;
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('securityTransactions').unsubscribe('*');
	}

	private onTransactionEvent(event: RecordSubscription<SecurityTransaction>) {
		if (!this._activeUserId) return;

		if (!event.action) return;
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this._refreshTimer = setTimeout(() => {
			this._refreshTimer = null;
			this.refreshTransactions().catch((error) =>
				this._pb.handleConnectionError(error, 'securityTransactions', 'realtime_refresh')
			);
		}, 200);
	}

	private get currentUrl() {
		if (browser) {
			return new URL(window.location.href);
		}

		return get(page).url;
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

		const currentUrl = this.currentUrl;
		const search = params.toString();
		const href = `${currentUrl.origin}${currentUrl.pathname}${search ? `?${search}` : ''}`;

		if (href !== currentUrl.href) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- URL is rebuilt from the current browser URL and dynamic filters.
			replaceState(href, {});
		}
	}

	get allRows() {
		return this.rawTransactions.map((transaction) => {
			const date = new Date(transaction.date);
			const dateValue = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
			const account = this._accountsContext.getAccount(transaction.account);
			const expandedAccount = transaction.expand?.account;
			const expandedSecurity = transaction.expand?.security;
			const accountName = account?.name ?? expandedAccount?.name ?? '';

			return {
				id: transaction.id,
				date,
				dateIso: transaction.date,
				dateValue,
				securityId: transaction.security || null,
				securityName: expandedSecurity?.name ?? '',
				securitySymbol: expandedSecurity?.symbol || null,
				type: transaction.type,
				subtype: transaction.subtype ?? '',
				description: (transaction.description || transaction.name || '').trim(),
				accountId: transaction.account || null,
				accountName,
				accountIsShared: Boolean(account?.isShared),
				quantity: this.toNumber(transaction.quantity),
				price: this.toNumber(transaction.price),
				amount: this.toNumber(transaction.amount),
				fees: this.toNumber(transaction.fees)
			};
		});
	}

	get filteredRows() {
		const query = this.search.trim().toLocaleLowerCase();
		const rows = query
			? this.allRows.filter((row) =>
					[
						row.securityName,
						row.securitySymbol,
						row.type,
						row.subtype,
						row.description,
						row.accountName
					]
						.filter((value): value is string => Boolean(value))
						.some((value) => value.toLocaleLowerCase().includes(query))
				)
			: this.allRows;

		return rows.sort((a, b) => {
			if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
			return a.id.localeCompare(b.id);
		});
	}

	private toNumber(value: number | string | null | undefined) {
		if (value === null || value === undefined || value === '') return null;
		const numberValue = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numberValue) ? numberValue : null;
	}

	dispose() {
		if (this._loadingDelayTimer) clearTimeout(this._loadingDelayTimer);
		if (this._refreshTimer) clearTimeout(this._refreshTimer);
		this.unsubscribeRealtime();
	}
}

const CONTEXT_KEY_SECURITY_TRANSACTIONS = 'securityTransactions';

export function setSecurityTransactionsContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_SECURITY_TRANSACTIONS, new SecurityTransactionsContext(pb));
}

export function getSecurityTransactionsContext() {
	return getContext<ReturnType<typeof setSecurityTransactionsContext>>(
		CONTEXT_KEY_SECURITY_TRANSACTIONS
	);
}
