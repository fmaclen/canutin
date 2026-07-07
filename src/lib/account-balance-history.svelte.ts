import type { AccountWithBalance } from './accounts.svelte';
import {
	advanceTrendSecurityValue,
	type TrendSecurityBalance,
	type TrendSecurityValueState
} from './balance-series';
import type {
	AccountBalancesResponse,
	SecurityBalancesResponse,
	TransactionsResponse
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { projectSignedValue } from './sharing';

type BalanceHistoryPoint = { date: Date; value: number };
type SecurityBalanceRow = SecurityBalancesResponse<number, number, number, number>;

function cumulativeTransactionPoints(transactions: TransactionsResponse[]) {
	let running = 0;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe scratch, discarded after building points
	const runningByDate = new Map<string, number>();
	for (const transaction of transactions) {
		if (transaction.excluded) continue;
		running += transaction.value ?? 0;
		runningByDate.set(transaction.date, running);
	}
	return [...runningByDate].map(([date, value]) => ({ date: new Date(date), value }));
}

function snapshotPoints(balances: AccountBalancesResponse[]) {
	return balances.map((balance) => ({ date: new Date(balance.asOf), value: balance.value ?? 0 }));
}

function buildSeries(
	cashPoints: BalanceHistoryPoint[],
	securityRows: SecurityBalanceRow[],
	getSecurityCurrency: (securityId: string) => string | undefined,
	accountCurrency: string,
	perspective: AccountWithBalance['perspective']
) {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local grouping scratch, discarded after building the series
	const balancesBySecurity = new Map<string, TrendSecurityBalance[]>();
	let hasForeignSecurity = false;
	for (const row of securityRows) {
		const currency = getSecurityCurrency(row.security);
		if (currency !== undefined && currency !== accountCurrency) hasForeignSecurity = true;
		const existing = balancesBySecurity.get(row.security) ?? [];
		existing.push({
			id: row.id,
			account: row.account,
			security: row.security,
			value: row.value,
			quantity: row.quantity,
			asOf: row.asOf,
			created: row.created
		});
		balancesBySecurity.set(row.security, existing);
	}

	// NOTE: a native worth figure is undefined when the account holds foreign-currency securities
	// (mirrors AccountPositionsValue.nativeValue), so no single-currency series can be drawn.
	if (hasForeignSecurity && balancesBySecurity.size > 0) return [];

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local date-union scratch, discarded after building the series
	const dateTimes = new Set<number>();
	for (const point of cashPoints) dateTimes.add(point.date.getTime());
	for (const row of securityRows) dateTimes.add(new Date(row.asOf).getTime());
	const dates = [...dateTimes].sort((a, b) => a - b).map((time) => new Date(time));
	if (dates.length === 0) return [];

	const sortedCash = [...cashPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
	let cashIndex = -1;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local per-security cursor scratch, discarded after building the series
	const securityStates = new Map<string, TrendSecurityValueState>();

	return dates.map((date) => {
		while (
			cashIndex + 1 < sortedCash.length &&
			sortedCash[cashIndex + 1].date.getTime() <= date.getTime()
		) {
			cashIndex++;
		}
		const cash = cashIndex >= 0 ? sortedCash[cashIndex].value : 0;
		let positions = 0;
		for (const [securityId, balances] of balancesBySecurity) {
			const state = securityStates.get(securityId) ?? {
				index: -1,
				lastKnownValue: null,
				soldOut: false
			};
			securityStates.set(securityId, state);
			const value = advanceTrendSecurityValue(balances, date, state);
			if (value !== null) positions += value;
		}
		return { date, value: projectSignedValue(cash + positions, perspective) };
	});
}

// NOTE: derives the account's worth history from whatever data its mode stores - a manual account's
// stored accountBalances snapshots, an auto-calculated account's cumulative transaction history, or
// an investment account's security positions over time - and sums cash with positions per date.
export function createAccountBalanceHistoryLoader(
	pb: PocketBaseContext,
	getAccount: () => AccountWithBalance | null | undefined,
	getSecurityCurrency: (securityId: string) => string | undefined
) {
	let history: BalanceHistoryPoint[] = $state([]);
	let isLoading = $state(true);

	$effect(() => {
		const account = getAccount();
		if (!account) return;
		const accountId = account.id;
		const accountCurrency = account.currency;
		const perspective = account.perspective;
		const isAutoCalculated = Boolean(account.autoCalculated);
		let cancelled = false;
		isLoading = true;

		void (async () => {
			try {
				const securityRowsPromise = pb.authedClient
					.collection('securityBalances')
					.getFullList<SecurityBalanceRow>({
						filter: `account='${accountId}'`,
						sort: 'security,asOf,created,id',
						fields: 'id,account,security,value,quantity,asOf,created',
						requestKey: null
					});

				let cashPoints: BalanceHistoryPoint[];
				if (isAutoCalculated) {
					const transactions = await pb.authedClient
						.collection('transactions')
						.getFullList<TransactionsResponse>({
							filter: `account='${accountId}'`,
							sort: 'date,created,id',
							fields: 'id,date,value,excluded',
							requestKey: null
						});
					cashPoints = cumulativeTransactionPoints(transactions);
				} else {
					const balances = await pb.authedClient
						.collection('accountBalances')
						.getFullList<AccountBalancesResponse>({
							filter: `account='${accountId}'`,
							sort: 'asOf,created,id',
							fields: 'id,value,asOf',
							requestKey: null
						});
					cashPoints = snapshotPoints(balances);
				}

				const securityRows = await securityRowsPromise;
				if (cancelled) return;
				history = buildSeries(
					cashPoints,
					securityRows,
					getSecurityCurrency,
					accountCurrency,
					perspective
				);
				isLoading = false;
			} catch (error) {
				if (cancelled) return;
				pb.handleConnectionError(error, 'accounts', 'balance_history');
				isLoading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	return {
		get history() {
			return history;
		},
		get isLoading() {
			return isLoading;
		}
	};
}
