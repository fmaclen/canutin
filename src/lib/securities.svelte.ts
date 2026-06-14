import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAccountsContext } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import type { SecuritiesResponse, SecurityBalancesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import {
	compareSecurityBalanceRecency,
	resolveSecurityBalanceValues
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
		const totals = new SvelteMap<string, number>();
		for (const resolved of resolveSecurityBalanceValues(this.securityBalances).values()) {
			if (resolved.value === null) continue;
			totals.set(
				resolved.balance.account,
				(totals.get(resolved.balance.account) ?? 0) + resolved.value
			);
		}
		return totals;
	});

	private securityBalances: SecurityBalance[] = $state([]);
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _accounts: ReturnType<typeof getAccountsContext>;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private refreshSequence = 0;

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
			.sort((a, b) => {
				if (a.value === null && b.value === null)
					return a.accountName.localeCompare(b.accountName, undefined, { sensitivity: 'base' });
				if (a.value === null) return 1;
				if (b.value === null) return -1;
				if (b.value !== a.value) return b.value - a.value;
				return a.accountName.localeCompare(b.accountName, undefined, { sensitivity: 'base' });
			});
	}

	getSummary(securityId: string) {
		return this.summarizeBalances(this.getAccountBalances(securityId));
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
		await this.refreshAll();
		return security;
	}

	async addSecurityBalance(securityId: string, balanceData: SecurityBalanceInput) {
		await this._pb.authedClient.collection('securityBalances').create({
			...balanceData,
			security: securityId
		});
		await this.refreshAll();
	}

	private init() {
		this.realtimeSubscribe();
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (!userId) {
				this.refreshSequence++;
				if (this.refreshTimer) clearTimeout(this.refreshTimer);
				this.refreshTimer = null;
				this.securities = [];
				this.securityBalances = [];
				this.positionsLoaded = false;
				this.isLoading = false;
				return;
			}
			this.isLoading = true;
			this.positionsLoaded = false;
			void this.refreshForCurrentUser();
		});
	}

	private async refreshForCurrentUser() {
		try {
			await this.refreshAll();
		} catch (error) {
			this._pb.handleConnectionError(error, 'securities', 'init');
		} finally {
			this.isLoading = false;
		}
	}

	private async refreshAll() {
		const token = ++this.refreshSequence;
		this.positionsLoaded = false;
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
		if (token !== this.refreshSequence) return;
		this.securities = securities;
		this.securityBalances = securityBalances;
		this.positionsLoaded = true;
		this._accounts.notifyBalancesChanged();
	}

	private realtimeSubscribe() {
		this._pb.authedClient
			.collection('securities')
			.subscribe('*', this.onRealtimeEvent.bind(this))
			.catch((error) => this._pb.handleSubscriptionError(error, 'securities', 'subscribe'));
		this._pb.authedClient
			.collection('securityBalances')
			.subscribe('*', this.onRealtimeEvent.bind(this))
			.catch((error) =>
				this._pb.handleSubscriptionError(error, 'securities', 'subscribe_balances')
			);
	}

	private onRealtimeEvent(
		event: RecordSubscription<SecuritiesResponse> | RecordSubscription<SecurityBalance>
	) {
		if (!event.action) return;
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			this.refreshAll().catch((error) =>
				this._pb.handleConnectionError(error, 'securities', 'refresh')
			);
		}, DEBOUNCE_MS);
	}

	private getEligibleAccountMap() {
		return new Map(
			this._accounts.accounts
				.filter((account) => !account.closed)
				.map((account) => [account.id, account])
		);
	}

	private getLatestBalancesByAccountSecurity() {
		const latestBalances = new SvelteMap<string, SecurityBalance>();
		for (const balance of this.securityBalances) {
			const key = `${balance.account}:${balance.security}`;
			const existing = latestBalances.get(key);
			if (!existing || compareSecurityBalanceRecency(balance, existing) < 0) {
				latestBalances.set(key, balance);
			}
		}
		return latestBalances;
	}

	private getLatestAccountBalanceRows() {
		const accounts = this.getEligibleAccountMap();
		const resolvedValues = resolveSecurityBalanceValues(this.securityBalances);

		const rows: SecurityAccountBalance[] = [];
		for (const resolved of resolvedValues.values()) {
			const balance = resolved.balance;
			const account = accounts.get(balance.account);
			if (!account) continue;

			const rawValue = resolved.value;
			const rawCostBasis = resolved.costBasis;
			const value = rawValue === null ? null : projectSignedValue(rawValue, account.perspective);
			const costBasis =
				rawCostBasis === null ? null : projectSignedValue(rawCostBasis, account.perspective);
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

		return aggregates.sort((a, b) => {
			if (a.value === null && b.value === null)
				return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
			if (a.value === null) return 1;
			if (b.value === null) return -1;
			if (b.value !== a.value) return b.value - a.value;
			return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
		});
	}

	private summarizeBalances(balances: SecurityAccountBalance[]) {
		const quantitiesComplete = balances.every((balance) => balance.quantity !== null);
		const valuesComplete = balances.every((balance) => balance.value !== null);
		const costsComplete = balances.every((balance) => balance.costBasis !== null);
		const quantity = quantitiesComplete
			? balances.reduce((sum, balance) => sum + (balance.quantity ?? 0), 0)
			: null;
		const value = valuesComplete
			? balances.reduce((sum, balance) => sum + (balance.value ?? 0), 0)
			: null;
		const costBasis = costsComplete
			? balances.reduce((sum, balance) => sum + (balance.costBasis ?? 0), 0)
			: null;

		return {
			quantity,
			value,
			costBasis,
			gainLoss: value === null || !valuesComplete || costBasis === null ? null : value - costBasis
		};
	}

	dispose() {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this._pb.authedClient.collection('securities').unsubscribe('*');
		this._pb.authedClient.collection('securityBalances').unsubscribe('*');
	}
}

export const CONTEXT_KEY_SECURITIES = 'securities';

export function setSecuritiesContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_SECURITIES, new SecuritiesContext(pb));
}

export function getSecuritiesContext() {
	return getContext<ReturnType<typeof setSecuritiesContext>>(CONTEXT_KEY_SECURITIES);
}
