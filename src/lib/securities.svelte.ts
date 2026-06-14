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
		for (const resolved of resolveSecurityBalanceValues(this.securityBalances).values()) {
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
		this.securityBalances = securityBalances;
		this.resolvePositionsLoaded();
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
			const userId = this._auth.currentUserId;
			const token = ++this.refreshSequence;
			this.refreshAll(userId, token).catch((error) => {
				if (userId !== this._auth.currentUserId || token !== this.refreshSequence) return;
				this._pb.handleConnectionError(error, 'securities', 'refresh');
				this.resolvePositionsLoaded();
			});
		}, DEBOUNCE_MS);
	}

	private getLatestAccountBalanceRows() {
		const accounts = new Map(
			this._accounts.accounts
				.filter((account) => !account.closed)
				.map((account) => [account.id, account])
		);
		const resolvedValues = resolveSecurityBalanceValues(this.securityBalances);

		const rows: SecurityAccountBalance[] = [];
		for (const resolved of resolvedValues.values()) {
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
