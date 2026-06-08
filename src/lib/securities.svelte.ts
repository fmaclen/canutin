import { compareDesc } from 'date-fns';
import { type RecordSubscription } from 'pocketbase';
import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import type {
	AccountsResponse,
	SecuritiesResponse,
	SecurityBalancesResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';

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

class SecuritiesContext {
	securities: SecuritiesResponse[] = $state([]);
	accounts: AccountsResponse[] = $state([]);
	securityBalances: SecurityBalance[] = $state([]);
	isLoading: boolean = $state(true);
	lastBalanceEvent: number = $state(0);

	private _pb: PocketBaseContext;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this.init();
	}

	get aggregateRows() {
		return this.computeAggregateRows().filter((row) => row.quantity === null || row.quantity !== 0);
	}

	getSecurity(id: string) {
		return this.securities.find((security) => security.id === id);
	}

	getAccountBalances(securityId: string) {
		return this.getLatestAccountBalanceRows()
			.filter((row) => row.securityId === securityId)
			.sort((a, b) =>
				a.accountName.localeCompare(b.accountName, undefined, { sensitivity: 'base' })
			);
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

	private async init() {
		try {
			this.realtimeSubscribe();
			await this.refreshAll();
		} catch (error) {
			this._pb.handleConnectionError(error, 'securities', 'init');
		} finally {
			this.isLoading = false;
		}
	}

	private async refreshAll() {
		const [securities, accounts, securityBalances] = await Promise.all([
			this._pb.authedClient.collection('securities').getFullList<SecuritiesResponse>({
				sort: 'name',
				requestKey: null
			}),
			this._pb.authedClient.collection('accounts').getFullList<AccountsResponse>({
				requestKey: null
			}),
			this._pb.authedClient.collection('securityBalances').getFullList<SecurityBalance>({
				sort: 'security,account,-asOf,-created,-id',
				requestKey: null
			})
		]);

		this.securities = securities;
		this.accounts = accounts;
		this.securityBalances = securityBalances;
		this.lastBalanceEvent = Date.now();
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
		this._pb.authedClient
			.collection('accounts')
			.subscribe('*', this.onRealtimeEvent.bind(this))
			.catch((error) =>
				this._pb.handleSubscriptionError(error, 'securities', 'subscribe_accounts')
			);
	}

	private onRealtimeEvent(
		event:
			| RecordSubscription<SecuritiesResponse>
			| RecordSubscription<SecurityBalance>
			| RecordSubscription<AccountsResponse>
	) {
		if (!event.action) return;
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			this.refreshAll().catch((error) =>
				this._pb.handleConnectionError(error, 'securities', 'refresh')
			);
		}, 200);
	}

	private getEligibleAccountMap() {
		return new SvelteMap(
			this.accounts.filter((account) => !account.closed).map((account) => [account.id, account])
		);
	}

	private getLatestBalancesByAccountSecurity() {
		const latestBalances = new SvelteMap<string, SecurityBalance>();
		for (const balance of this.securityBalances) {
			const key = `${balance.account}:${balance.security}`;
			const existing = latestBalances.get(key);
			if (!existing || this.compareBalanceRecency(balance, existing) < 0) {
				latestBalances.set(key, balance);
			}
		}
		return latestBalances;
	}

	private getLatestAccountBalanceRows() {
		const accounts = this.getEligibleAccountMap();
		const rows: SecurityAccountBalance[] = [];
		for (const balance of this.getLatestBalancesByAccountSecurity().values()) {
			const account = accounts.get(balance.account);
			if (!account) continue;

			const value = this.toNumber(balance.value);
			const costBasis = this.toNumber(balance.costBasis);
			rows.push({
				id: balance.id,
				accountId: account.id,
				accountName: account.name,
				securityId: balance.security,
				quantity: this.toNumber(balance.quantity),
				price: this.toNumber(balance.price),
				value,
				costBasis,
				gainLoss: value === null || costBasis === null ? null : value - costBasis,
				asOf: balance.asOf
			});
		}
		return rows;
	}

	private computeAggregateRows() {
		const securitiesById = new SvelteMap(
			this.securities.map((security) => [security.id, security])
		);
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

		return aggregates.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
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

	private compareBalanceRecency(a: SecurityBalance, b: SecurityBalance) {
		const asOfCompare = compareDesc(new Date(a.asOf), new Date(b.asOf));
		if (asOfCompare !== 0) return asOfCompare;
		const createdCompare = compareDesc(new Date(a.created), new Date(b.created));
		if (createdCompare !== 0) return createdCompare;
		return b.id.localeCompare(a.id);
	}

	private toNumber(value: number | string | null | undefined) {
		if (value === null || value === undefined || value === '') return null;
		const numberValue = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numberValue) ? numberValue : null;
	}

	dispose() {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this._pb.authedClient.collection('securities').unsubscribe('*');
		this._pb.authedClient.collection('securityBalances').unsubscribe('*');
		this._pb.authedClient.collection('accounts').unsubscribe('*');
	}
}

export const CONTEXT_KEY_SECURITIES = 'securities';

export function setSecuritiesContext(pb: PocketBaseContext) {
	return setContext(CONTEXT_KEY_SECURITIES, new SecuritiesContext(pb));
}

export function getSecuritiesContext() {
	return getContext<ReturnType<typeof setSecuritiesContext>>(CONTEXT_KEY_SECURITIES);
}
