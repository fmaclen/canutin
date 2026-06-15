import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAccountsContext } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import type { SecuritiesResponse, SecurityBalancesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import {
	compareByValueDescThenName,
	resolveSecurityBalanceValues,
	type SecurityBalanceResolvedValue,
	sumOrUnknown
} from './security-balance-values';
import { projectSignedValue } from './sharing';
import { toNumber } from './utils';

type SecurityBalance = SecurityBalancesResponse<number, number, number, number>;

type SecurityBalanceInput = {
	account: string;
	owner: string;
	asOf: string;
	quantity: number | null;
	price: number | null;
	value: number | null;
	costBasis: number | null;
};

export type SecurityAccountBalance = {
	id: string;
	accountId: string;
	accountName: string;
	securityId: string;
	quantity: number | null;
	price: number | null;
	value: number | null;
	costBasis: number | null;
	gainLoss: number | null;
	asOf: string;
};

export type SecurityAggregate = {
	id: string;
	name: string;
	symbol: string | null;
	accounts: Array<{ id: string; name: string }>;
	quantity: number | null;
	value: number | null;
	costBasis: number | null;
	gainLoss: number | null;
};

const DEBOUNCE_MS = 200;

class SecuritiesContext {
	securities: SecuritiesResponse[] = $state([]);
	isLoading: boolean = $state(true);
	positionsLoaded = false;

	positionsValueByAccount = $derived.by(() => {
		const eligibleAccountIds = new Set(
			this._accounts.accountRecords
				.filter((account) => !account.closed)
				.map((account) => account.id)
		);
		const valuesByAccount = new SvelteMap<string, Array<number | null>>();
		for (const resolved of this.currentPositions.values()) {
			const accountId = resolved.balance.account;
			if (!eligibleAccountIds.has(accountId)) continue;
			const values = valuesByAccount.get(accountId) ?? [];
			values.push(resolved.value);
			valuesByAccount.set(accountId, values);
		}
		return new Map(
			[...valuesByAccount].map(([accountId, values]) => [accountId, sumOrUnknown(values)])
		);
	});

	private currentPositions = new SvelteMap<string, SecurityBalanceResolvedValue>();
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _accounts: ReturnType<typeof getAccountsContext>;
	private positionRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private refreshSequence = 0;
	private _activeUserId = '';
	private _isSubscribed = false;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._accounts = getAccountsContext();
		this.init();
	}

	get aggregateRows() {
		return this.computeAggregateRows();
	}

	getSecurity(id: string) {
		return this.securities.find((security) => security.id === id);
	}

	getAccountBalances(securityId: string) {
		return this.getLatestAccountBalanceRows()
			.filter((row) => row.securityId === securityId)
			.sort(
				compareByValueDescThenName(
					(row) => row.value,
					(row) => row.accountName
				)
			);
	}

	async updateSecurity(id: string, data: { name: string; symbol: string }) {
		await this._pb.authedClient.collection('securities').update(id, data);
	}

	async createSecurityWithBalance(
		securityData: { name: string; symbol?: string; owner: string },
		balanceData: SecurityBalanceInput
	) {
		const security = await this._pb.postJson<SecuritiesResponse>(
			'/api/canutin/securities/with-initial-balance',
			{
				security: securityData,
				balance: balanceData
			}
		);
		this.upsertSecurity(security);
		if (
			await this.refreshPosition(
				balanceData.account,
				security.id,
				this._auth.currentUserId,
				this.refreshSequence
			)
		) {
			this._accounts.notifyBalancesChanged();
		}
		return security;
	}

	async addSecurityBalance(securityId: string, balanceData: SecurityBalanceInput) {
		await this._pb.authedClient.collection('securityBalances').create({
			...balanceData,
			security: securityId
		});
		if (
			await this.refreshPosition(
				balanceData.account,
				securityId,
				this._auth.currentUserId,
				this.refreshSequence
			)
		) {
			this._accounts.notifyBalancesChanged();
		}
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this._activeUserId = userId;
			if (!userId) {
				this.refreshSequence++;
				this.clearPositionRefreshTimers();
				this.securities = [];
				this.currentPositions.clear();
				this.positionsLoaded = false;
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.positionsLoaded = false;
			this.realtimeSubscribe(userId);
			void this.refreshForCurrentUser();
		});
	}

	private async refreshForCurrentUser() {
		const userId = this._auth.currentUserId;
		const token = ++this.refreshSequence;
		try {
			await this.refreshAll(userId, token);
		} catch (error) {
			if (userId !== this._auth.currentUserId || token !== this.refreshSequence) return;
			this._pb.handleConnectionError(error, 'securities', 'init');
			this.resolvePositionsLoaded();
		} finally {
			if (userId === this._auth.currentUserId && token === this.refreshSequence)
				this.isLoading = false;
		}
	}

	private resolvePositionsLoaded() {
		this.positionsLoaded = true;
		this._accounts.notifyBalancesChanged();
	}

	private async refreshAll(userId = this._auth.currentUserId, token = ++this.refreshSequence) {
		const [securities, securityBalances] = await Promise.all([
			this._pb.authedClient.collection('securities').getFullList<SecuritiesResponse>({
				sort: 'name',
				requestKey: null
			}),
			this._pb.authedClient.collection('securityBalances').getFullList<SecurityBalance>({
				sort: 'security,account,-asOf,-created,-id',
				requestKey: null
			})
		]);
		if (userId !== this._auth.currentUserId || token !== this.refreshSequence) return;
		this.securities = securities;
		this.currentPositions.clear();
		for (const [key, position] of resolveSecurityBalanceValues(securityBalances)) {
			this.currentPositions.set(key, position);
		}
		this.resolvePositionsLoaded();
	}

	private realtimeSubscribe(userId = this._activeUserId) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;

		this._pb.authedClient
			.collection('securities')
			.subscribe<SecuritiesResponse>('*', (event) => this.onSecurityEvent(event, userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'securities', 'subscribe');
				} else {
					console.error('[securitiesStore] Stale subscription failed:', error);
				}
			});
		this._pb.authedClient
			.collection('securityBalances')
			.subscribe<SecurityBalance>('*', (event) => this.onSecurityBalanceEvent(event, userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'securities', 'subscribe_balances');
				} else {
					console.error('[securitiesStore] Stale subscription failed:', error);
				}
			});
		this._isSubscribed = true;
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('securities').unsubscribe('*');
		this._pb.authedClient.collection('securityBalances').unsubscribe('*');
	}

	private onSecurityEvent(event: RecordSubscription<SecuritiesResponse>, userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		if (!event.action) return;
		if (event.action === 'delete') {
			this.securities = this.securities.filter((security) => security.id !== event.record.id);
			for (const [key, position] of this.currentPositions) {
				if (position.balance.security === event.record.id) this.currentPositions.delete(key);
			}
			if (this.positionsLoaded) this._accounts.notifyBalancesChanged();
			return;
		}

		this.upsertSecurity(event.record);
	}

	private onSecurityBalanceEvent(event: RecordSubscription<SecurityBalance>, userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		if (!event.action) return;

		const key = this.positionKey(event.record.account, event.record.security);
		if (event.action === 'update') {
			for (const [currentKey, position] of this.currentPositions) {
				if (position.balance.id === event.record.id && currentKey !== key) {
					const [accountId, securityId] = currentKey.split(':');
					if (accountId && securityId) this.schedulePositionRefresh(accountId, securityId, userId);
				}
			}
		}

		this.schedulePositionRefresh(event.record.account, event.record.security, userId);
	}

	private schedulePositionRefresh(accountId: string, securityId: string, userId: string) {
		const key = this.positionKey(accountId, securityId);
		const existing = this.positionRefreshTimers.get(key);
		if (existing) clearTimeout(existing);

		this.positionRefreshTimers.set(
			key,
			setTimeout(() => {
				this.positionRefreshTimers.delete(key);
				const token = this.refreshSequence;
				void this.refreshPosition(accountId, securityId, userId, token)
					.then((refreshed) => {
						if (refreshed && this.positionsLoaded) this._accounts.notifyBalancesChanged();
					})
					.catch((error) => {
						if (userId !== this._auth.currentUserId || token !== this.refreshSequence) return;
						this._pb.handleConnectionError(error, 'securities', 'position_refresh');
					});
			}, DEBOUNCE_MS)
		);
	}

	private async refreshPosition(
		accountId: string,
		securityId: string,
		userId: string,
		token: number
	) {
		if (!userId || userId !== this._auth.currentUserId || token !== this.refreshSequence)
			return false;
		const balances = await this._pb.authedClient.collection('securityBalances').getFullList<SecurityBalance>({
			filter: `account='${accountId}' && security='${securityId}'`,
			sort: '-asOf,-created,-id',
			requestKey: null
		});
		if (userId !== this._auth.currentUserId || token !== this.refreshSequence) return false;

		const key = this.positionKey(accountId, securityId);
		const position = resolveSecurityBalanceValues(balances).get(key);
		if (position) this.currentPositions.set(key, position);
		else this.currentPositions.delete(key);
		return true;
	}

	private positionKey(accountId: string, securityId: string) {
		return `${accountId}:${securityId}`;
	}

	private upsertSecurity(security: SecuritiesResponse) {
		const exists = this.securities.some((record) => record.id === security.id);
		this.securities = (exists
			? this.securities.map((record) => (record.id === security.id ? security : record))
			: [...this.securities, security]
		).toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	}

	private clearPositionRefreshTimers() {
		for (const timer of this.positionRefreshTimers.values()) {
			clearTimeout(timer);
		}
		this.positionRefreshTimers.clear();
	}

	private getLatestAccountBalanceRows() {
		const accounts = new Map(
			this._accounts.accounts
				.filter((account) => !account.closed)
				.map((account) => [account.id, account])
		);
		const rows: SecurityAccountBalance[] = [];
		for (const resolved of this.currentPositions.values()) {
			const balance = resolved.balance;
			const account = accounts.get(balance.account);
			if (!account) continue;

			const value = projectSignedValue(resolved.value, account.perspective);
			const costBasis = projectSignedValue(resolved.costBasis, account.perspective);
			rows.push({
				id: balance.id,
				accountId: account.id,
				accountName: account.name,
				securityId: balance.security,
				quantity: toNumber(balance.quantity),
				price: toNumber(balance.price),
				value,
				costBasis,
				gainLoss: value === null || costBasis === null ? null : value - costBasis,
				asOf: balance.asOf
			});
		}
		return rows;
	}

	private computeAggregateRows() {
		const securitiesById = new Map(this.securities.map((security) => [security.id, security]));
		const balancesBySecurity = new SvelteMap<string, SecurityAccountBalance[]>();
		for (const row of this.getLatestAccountBalanceRows()) {
			if (row.quantity === 0) continue;
			const rows = balancesBySecurity.get(row.securityId) ?? [];
			rows.push(row);
			balancesBySecurity.set(row.securityId, rows);
		}

		const aggregates: SecurityAggregate[] = [];
		for (const [securityId, balances] of balancesBySecurity) {
			const security = securitiesById.get(securityId);
			if (!security) continue;
			const summary = this.summarizeBalances(balances);
			aggregates.push({
				id: security.id,
				name: security.name,
				symbol: security.symbol || null,
				accounts: balances
					.map((balance) => ({ id: balance.accountId, name: balance.accountName }))
					.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
				...summary
			});
		}

		return aggregates.sort(
			compareByValueDescThenName(
				(aggregate) => aggregate.value,
				(aggregate) => aggregate.name
			)
		);
	}

	private summarizeBalances(balances: SecurityAccountBalance[]) {
		const quantity = sumOrUnknown(balances.map((balance) => balance.quantity));
		const value = sumOrUnknown(balances.map((balance) => balance.value));
		const costBasis = sumOrUnknown(balances.map((balance) => balance.costBasis));

		return {
			quantity,
			value,
			costBasis,
			gainLoss: value === null || costBasis === null ? null : value - costBasis
		};
	}

	dispose() {
		this.clearPositionRefreshTimers();
		this.unsubscribeRealtime();
	}
}

export const CONTEXT_KEY_SECURITIES = 'securities';

export function setSecuritiesContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_SECURITIES, new SecuritiesContext(pb));
}

export function getSecuritiesContext() {
	return getContext<ReturnType<typeof setSecuritiesContext>>(CONTEXT_KEY_SECURITIES);
}
