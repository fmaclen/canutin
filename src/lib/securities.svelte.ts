import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAccountsContext } from './accounts.svelte';
import { getAuthContext } from './auth.svelte';
import { getExchangeRatesContext } from './exchange-rates.svelte';
import { logError } from './logger';
import type { SecuritiesResponse, SecurityBalancesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';
import {
	compareByValueDescThenName,
	resolveSecurityBalanceValues,
	sumOrUnknown,
	type SecurityBalanceResolvedValue
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
	isConverted: boolean;
	isUnconverted: boolean;
	missingCurrency: string | null;
	nativeValue: number | null;
	nativeCostBasis: number | null;
	nativeGainLoss: number | null;
};

export type SecurityAggregate = {
	id: string;
	name: string;
	symbol: string | null;
	accounts: Array<{ id: string; name: string }>;
	balances: SecurityAccountBalance[];
	quantity: number | null;
	value: number | null;
	costBasis: number | null;
	gainLoss: number | null;
	isConverted: boolean;
	isUnconverted: boolean;
};

// NOTE: `value` is the account's positions summed in the display currency (each position converted
// at its own currency/date); `nativeValue` is the same sum in the account's own currency, and is
// null when the account holds any foreign-currency security (no single native figure exists then).
// accounts.svelte.ts adds this to separately-converted cash - it must not convert `value` again.
export type AccountPositionsValue = {
	value: number | null;
	nativeValue: number | null;
	isConverted: boolean;
	isUnconverted: boolean;
	missingCurrency: string | null;
};

type PositionsAccumulator = {
	displayValues: Array<number | null>;
	nativeValues: Array<number | null>;
	hasForeign: boolean;
	isConverted: boolean;
	isUnconverted: boolean;
	missingCurrency: string | null;
};

const DEBOUNCE_MS = 200;

class SecuritiesContext {
	securities: SecuritiesResponse[] = $state([]);
	isLoading = $state(true);
	positionsLoaded = false;

	positionsValueByAccount = $derived.by(() => {
		const currencyByAccount = new Map(
			this._accounts.accountRecords
				.filter((account) => !account.closed)
				.map((account) => [account.id, account.currency] as const)
		);
		const securitiesById = this.securitiesById;
		const accumulators = new SvelteMap<string, PositionsAccumulator>();
		for (const resolved of this.currentPositions.values()) {
			const accountId = resolved.balance.account;
			const accountCurrency = currencyByAccount.get(accountId);
			if (accountCurrency === undefined) continue;
			const currency = securitiesById.get(resolved.balance.security)?.currency ?? '';
			const converted = this.convertOrNull(resolved.value, currency, resolved.balance.asOf);
			const accumulator = accumulators.get(accountId) ?? {
				displayValues: [],
				nativeValues: [],
				hasForeign: false,
				isConverted: false,
				isUnconverted: false,
				missingCurrency: null
			};
			accumulator.displayValues.push(converted.isUnconverted ? 0 : converted.value);
			accumulator.nativeValues.push(resolved.value);
			if (currency !== accountCurrency) accumulator.hasForeign = true;
			accumulator.isConverted ||= converted.isConverted;
			accumulator.isUnconverted ||= converted.isUnconverted;
			accumulator.missingCurrency ??= converted.missingCurrency;
			accumulators.set(accountId, accumulator);
		}
		return new Map<string, AccountPositionsValue>(
			[...accumulators].map(([accountId, accumulator]) => [
				accountId,
				{
					value: sumOrUnknown(accumulator.displayValues),
					nativeValue: accumulator.hasForeign ? null : sumOrUnknown(accumulator.nativeValues),
					isConverted: accumulator.isConverted,
					isUnconverted: accumulator.isUnconverted,
					missingCurrency: accumulator.missingCurrency
				}
			])
		);
	});

	private currentPositions = new SvelteMap<string, SecurityBalanceResolvedValue>();
	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _accounts: ReturnType<typeof getAccountsContext>;
	private _fx: ReturnType<typeof getExchangeRatesContext>;
	private sequence = new RequestSequence();
	private debouncer = new Debouncer(DEBOUNCE_MS);
	private _activeUserId = '';
	private _isSubscribed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _reconnectCallback = () => this.invalidate();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._pb.registerRealtimeReconnect(this._reconnectCallback);
		this._accounts = getAccountsContext();
		this._fx = getExchangeRatesContext();
		this.init();
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

	async addSecurityBalance(securityId: string, balanceData: SecurityBalanceInput) {
		await this._pb.authedClient.collection('securityBalances').create({
			...balanceData,
			security: securityId
		});
		// Refresh directly rather than via the debounce so the user's own write shows immediately;
		// refreshAll notifies accounts of the new balances on commit.
		await this.refreshForCurrentUser();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.debouncer.cancel();
			this.sequence.bump();
			this._activeUserId = userId;
			if (!userId) {
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

	// Realtime events and reconnects are pure invalidation signals: they never patch a payload into
	// state, they only schedule a full refetch. A security delete cascades to its securityBalances
	// server-side, so the deleted rows are simply absent from the next snapshot - no epoch guard or
	// buffered replay is needed to keep them gone.
	private invalidate() {
		this.debouncer.schedule(() => void this.refreshForCurrentUser());
	}

	private async refreshForCurrentUser() {
		const userId = this._auth.currentUserId;
		const token = this.sequence.next();
		try {
			await this.refreshAll(userId, token);
		} catch (error) {
			if (userId !== this._auth.currentUserId || !this.sequence.isCurrent(token)) return;
			this._pb.handleConnectionError(error, 'securities', 'refresh');
			this.resolvePositionsLoaded();
		} finally {
			if (userId === this._auth.currentUserId && this.sequence.isCurrent(token))
				this.isLoading = false;
		}
	}

	private resolvePositionsLoaded() {
		this.positionsLoaded = true;
		this._accounts.notifyBalancesChanged();
	}

	private async refreshAll(userId: string, token: number) {
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
		if (userId !== this._auth.currentUserId || !this.sequence.isCurrent(token)) return;

		this.securities = securities.toSorted((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
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
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'securities', 'subscribe');
				} else {
					logError('securitiesStore', 'stale_subscription', error);
				}
			});
		this._pb.authedClient
			.collection('securityBalances')
			.subscribe('*', () => this.onRealtimeEvent(userId))
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'securities', 'subscribe_balances');
				} else {
					logError('securitiesStore', 'stale_subscription', error);
				}
			});
		this._isSubscribed = true;
	}

	private onRealtimeEvent(userId: string) {
		if (!userId || userId !== this._activeUserId) return;
		this.invalidate();
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('securities').unsubscribe('*');
		this._pb.authedClient.collection('securityBalances').unsubscribe('*');
	}

	private getLatestAccountBalanceRows() {
		const accounts = new Map(
			this._accounts.accounts
				.filter((account) => !account.closed)
				.map((account) => [account.id, account])
		);
		const securitiesById = this.securitiesById;
		const rows: SecurityAccountBalance[] = [];
		for (const resolved of this.currentPositions.values()) {
			const balance = resolved.balance;
			const account = accounts.get(balance.account);
			if (!account) continue;

			const currency = securitiesById.get(balance.security)?.currency ?? '';
			const valueConversion = this.convertOrNull(resolved.value, currency, balance.asOf);
			const costBasisConversion = this.convertOrNull(resolved.costBasis, currency, balance.asOf);
			const value = projectSignedValue(valueConversion.value, account.perspective);
			const costBasis = projectSignedValue(costBasisConversion.value, account.perspective);
			const nativeValue = projectSignedValue(resolved.value, account.perspective);
			const nativeCostBasis = projectSignedValue(resolved.costBasis, account.perspective);
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
				asOf: balance.asOf,
				isConverted: valueConversion.isConverted || costBasisConversion.isConverted,
				isUnconverted: valueConversion.isUnconverted || costBasisConversion.isUnconverted,
				missingCurrency: valueConversion.missingCurrency ?? costBasisConversion.missingCurrency,
				nativeValue,
				nativeCostBasis,
				nativeGainLoss:
					nativeValue === null || nativeCostBasis === null ? null : nativeValue - nativeCostBasis
			});
		}
		return rows;
	}

	private get securitiesById() {
		return new Map(this.securities.map((security) => [security.id, security]));
	}

	// NOTE: securityBalances' value/costBasis are JSON-typed where `null` means UNKNOWN (see
	// resolveSecurityBalanceValues) - conversion must leave that `null` untouched rather than
	// coercing it into a native-vs-converted value.
	private convertOrNull(value: number | null, currency: string, date: string) {
		if (value === null)
			return { value: null, isConverted: false, isUnconverted: false, missingCurrency: null };
		return this._fx.convert(value, currency, date);
	}

	getAggregateRows(accountId: string | null) {
		const securitiesById = this.securitiesById;
		const balancesBySecurity = new SvelteMap<string, SecurityAccountBalance[]>();
		for (const row of this.getLatestAccountBalanceRows()) {
			if (row.quantity === 0 || (accountId && row.accountId !== accountId)) continue;
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
				balances,
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
		const value = sumOrUnknown(
			balances.map((balance) => (balance.isUnconverted ? 0 : balance.value))
		);
		const costBasis = sumOrUnknown(
			balances.map((balance) => (balance.isUnconverted ? 0 : balance.costBasis))
		);

		return {
			quantity,
			value,
			costBasis,
			gainLoss: value === null || costBasis === null ? null : value - costBasis,
			isConverted: balances.some((balance) => balance.isConverted),
			isUnconverted: balances.some((balance) => balance.isUnconverted)
		};
	}

	dispose() {
		this.debouncer.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeReconnect(this._reconnectCallback);
		this.unsubscribeRealtime();
		this.sequence.bump();
	}
}

export function setSecuritiesContext(pb: PocketBaseContext) {
	return setContext('securities', new SecuritiesContext(pb));
}

export function getSecuritiesContext() {
	return getContext<ReturnType<typeof setSecuritiesContext>>('securities');
}
