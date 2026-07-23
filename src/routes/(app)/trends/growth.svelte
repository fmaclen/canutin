<script lang="ts">
	import { UTCDate } from '@date-fns/utc';
	import { eachDayOfInterval, startOfDay, subYears } from 'date-fns';
	import { untrack } from 'svelte';

	import {
		advanceTrendSecurityValue,
		latestIndexBeforeOrEqual,
		type TrendSecurityValueState
	} from '$lib/balance-series';
	import { formatCurrency } from '$lib/components/currency';
	import TimeSeriesChart from '$lib/components/time-series-chart.svelte';
	import { getExchangeRatesContext } from '$lib/exchange-rates.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { AccountsResponse, AssetsResponse } from '$lib/pocketbase.schema';

	import {
		type BalanceGroup,
		type TrendGroupKey as GroupKey,
		type PreparedTrendMaps,
		type TrendSeriesRow as Row,
		type TrendMemberSeries
	} from './trends';

	let {
		maxStart,
		memberSeries = $bindable(),
		isLoading,
		prepared,
		rawAccounts,
		rawAssets
	}: {
		maxStart: Date | null;
		memberSeries: TrendMemberSeries;
		isLoading: boolean;
		prepared: PreparedTrendMaps;
		rawAccounts: AccountsResponse[];
		rawAssets: AssetsResponse[];
	} = $props();

	type GroupSums = Record<Exclude<GroupKey, 'net'>, number>;
	type GroupUnconverted = Record<Exclude<GroupKey, 'net'>, boolean>;

	const fx = getExchangeRatesContext();

	// Full-range rows computed once per data change; the chart's period chooser only reslices
	// them. Raw state: the rows are replaced wholesale and never mutated, so the charts skip
	// per-property proxy traps over the ~1,800-row series.
	let seriesRows: Row[] = $state.raw([]);

	function convertSnapshot<T extends { asOf: string }>(
		balances: T[],
		index: number,
		rawValue: (balance: T) => number,
		currency: string,
		terminatedAt: string | undefined,
		datePoint: Date
	) {
		if (index < 0 || (terminatedAt && datePoint >= new Date(terminatedAt))) {
			return { value: 0, isConverted: false, isUnconverted: false };
		}
		const balance = balances[index];
		return fx.convert(rawValue(balance), currency, balance.asOf);
	}

	function groupKey(group: BalanceGroup) {
		return group === 'CASH'
			? 'cash'
			: group === 'DEBT'
				? 'debt'
				: group === 'INVESTMENT'
					? 'investment'
					: 'other';
	}

	function accumulateGroup(
		sums: GroupSums,
		unconverted: GroupUnconverted,
		group: BalanceGroup,
		value: number,
		isUnconverted: boolean
	) {
		const key = groupKey(group);
		if (!isUnconverted) sums[key] += value;
		unconverted[key] ||= isUnconverted;
	}

	function recomputeSeries() {
		const [previousSeriesRows, previousMemberSeries] = untrack(() => [seriesRows, memberSeries]);
		if (!rawAccounts.length && !rawAssets.length) {
			if (previousSeriesRows.length) seriesRows = [];
			if (previousMemberSeries.rows.length) memberSeries = { members: [], rows: [] };
			return;
		}
		// The rows always span the widest choosable window - five years, or the earliest balance
		// when it is older - so every period (including MAX) is a slice of the same computation.
		// Days before the first balance sum to zero, matching the bounded windows' zero lead-in.
		const now = startOfDay(new UTCDate());
		const fiveYearsAgo = subYears(now, 5);
		const start = maxStart && maxStart < fiveYearsAgo ? maxStart : fiveYearsAgo;

		const datePoints = eachDayOfInterval({ start: new UTCDate(start), end: new UTCDate(now) });

		const {
			accountBalancesByAccountId,
			securityBalancesByAccountSecurity,
			assetBalancesByAssetId,
			accountById,
			assetById,
			securityCurrencyById
		} = prepared;

		// Plain records for the scratch state: it is written tens of thousands of times per
		// recompute and needs no reactivity of its own.
		const accountIndexPointer: Record<string, number> = {};
		for (const [accountId, balances] of accountBalancesByAccountId)
			accountIndexPointer[accountId] = latestIndexBeforeOrEqual(balances, datePoints[0], -1);
		const securityValueState: Record<string, TrendSecurityValueState> = {};
		const assetIndexPointer: Record<string, number> = {};
		for (const [assetId, balances] of assetBalancesByAssetId)
			assetIndexPointer[assetId] = latestIndexBeforeOrEqual(balances, datePoints[0], -1);

		// Per-entity daily values for the group charts, keyed by account/asset id. Days without a
		// contribution stay null so a windowed slice can tell "no data in this window" (member
		// dropped) apart from a contributed zero.
		const memberValues: Record<string, Array<number | null>> = {};
		function addMemberValue(id: string, pointIndex: number, value: number) {
			const values = (memberValues[id] ??= new Array<number | null>(datePoints.length).fill(null));
			values[pointIndex] = (values[pointIndex] ?? 0) + value;
		}

		const rows: Row[] = [];
		for (const [pointIndex, datePoint] of datePoints.entries()) {
			const sums: GroupSums = { cash: 0, debt: 0, investment: 0, other: 0 };
			const unconverted: GroupUnconverted = {
				cash: false,
				debt: false,
				investment: false,
				other: false
			};

			for (const [accountId, balances] of accountBalancesByAccountId) {
				const meta = accountById.get(accountId);
				if (!meta) continue;
				const previousIndex = accountIndexPointer[accountId] ?? -1;
				const index = latestIndexBeforeOrEqual(balances, datePoint, previousIndex);
				accountIndexPointer[accountId] = index;
				const conversion = convertSnapshot(
					balances,
					index,
					(balance) => balance.value ?? 0,
					meta.currency,
					meta.closed,
					datePoint
				);
				accumulateGroup(
					sums,
					unconverted,
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion.isUnconverted
				);
				if (index >= 0 && !(meta.closed && datePoint >= new Date(meta.closed)))
					addMemberValue(accountId, pointIndex, conversion.isUnconverted ? 0 : conversion.value);
			}

			for (const [key, balances] of securityBalancesByAccountSecurity) {
				const accountId = balances[0]?.account;
				if (!accountId) continue;
				const meta = accountById.get(accountId);
				if (!meta) continue;
				if (meta.closed && datePoint >= new Date(meta.closed)) continue;
				const state = (securityValueState[key] ??= {
					index: -1,
					lastKnownValue: null,
					soldOut: false
				});
				const rawValue = advanceTrendSecurityValue(balances, datePoint, state);
				if (rawValue === null) continue;
				// NOTE: securities load from a different context than these balances, so their currency
				// map can briefly lag; fall back to the account's currency so all-USD data stays
				// unconverted instead of flashing an FX indicator during that window.
				const conversion = fx.convert(
					rawValue,
					securityCurrencyById.get(balances[0].security) ?? meta.currency,
					balances[state.index].asOf
				);
				accumulateGroup(
					sums,
					unconverted,
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion.isUnconverted
				);
				// Positions roll up into their owning account's series
				addMemberValue(accountId, pointIndex, conversion.isUnconverted ? 0 : conversion.value);
			}

			for (const [assetId, balances] of assetBalancesByAssetId) {
				const meta = assetById.get(assetId);
				if (!meta) continue;
				const previousIndex = assetIndexPointer[assetId] ?? -1;
				const index = latestIndexBeforeOrEqual(balances, datePoint, previousIndex);
				assetIndexPointer[assetId] = index;
				const conversion = convertSnapshot(
					balances,
					index,
					(balance) => balance.marketValue ?? 0,
					meta.currency,
					meta.sold,
					datePoint
				);
				accumulateGroup(
					sums,
					unconverted,
					meta.balanceGroup as BalanceGroup,
					conversion.value,
					conversion.isUnconverted
				);
				if (index >= 0 && !(meta.sold && datePoint >= new Date(meta.sold)))
					addMemberValue(assetId, pointIndex, conversion.isUnconverted ? 0 : conversion.value);
			}

			const net = sums.cash + sums.debt + sums.investment + sums.other;
			const netIsUnconverted =
				unconverted.cash || unconverted.debt || unconverted.investment || unconverted.other;
			rows.push({
				date: datePoint,
				net,
				cash: sums.cash,
				debt: sums.debt,
				investment: sums.investment,
				other: sums.other,
				isUnconverted: { net: netIsUnconverted, ...unconverted }
			});
		}

		if (
			previousSeriesRows.length !== rows.length ||
			rows.some((row, index) => {
				const previous = previousSeriesRows[index];
				return (
					row.date.getTime() !== previous.date.getTime() ||
					row.net !== previous.net ||
					row.cash !== previous.cash ||
					row.debt !== previous.debt ||
					row.investment !== previous.investment ||
					row.other !== previous.other ||
					row.isUnconverted.net !== previous.isUnconverted.net ||
					row.isUnconverted.cash !== previous.isUnconverted.cash ||
					row.isUnconverted.debt !== previous.isUnconverted.debt ||
					row.isUnconverted.investment !== previous.isUnconverted.investment ||
					row.isUnconverted.other !== previous.isUnconverted.other
				);
			})
		)
			seriesRows = rows;

		const nextMemberSeries: TrendMemberSeries = {
			members: [...rawAccounts, ...rawAssets]
				.filter((entity) => entity.id in memberValues)
				.map((entity) => ({
					key: entity.id,
					label: entity.name,
					group: groupKey(entity.balanceGroup as BalanceGroup)
				})),
			rows: datePoints.map((date, index) => ({
				date,
				values: Object.fromEntries(
					Object.entries(memberValues).map(([id, values]) => [id, values[index]] as const)
				)
			}))
		};
		if (
			previousMemberSeries.members.length !== nextMemberSeries.members.length ||
			previousMemberSeries.rows.length !== nextMemberSeries.rows.length ||
			nextMemberSeries.members.some((member, index) => {
				const previous = previousMemberSeries.members[index];
				return (
					member.key !== previous.key ||
					member.label !== previous.label ||
					member.group !== previous.group
				);
			}) ||
			nextMemberSeries.rows.some((row, index) => {
				const previous = previousMemberSeries.rows[index];
				return (
					row.date.getTime() !== previous.date.getTime() ||
					Object.keys(row.values).some((key) => !Object.is(row.values[key], previous.values[key]))
				);
			})
		)
			memberSeries = nextMemberSeries;
	}

	$effect(() => recomputeSeries());
</script>

<!-- NOTE: reference the raw tokens (--cash, not --color-cash): ChartStyle re-emits each config
color as --color-<key> per chart, so var(--color-cash) would be a circular reference. -->
<TimeSeriesChart
	title={m.trends_growth_section_title()}
	{isLoading}
	rows={seriesRows}
	period="1y"
	{maxStart}
	series={[
		{
			key: 'net',
			label: m.trends_series_net_label(),
			color: 'var(--foreground)',
			value: (row) => row.net,
			isUnconverted: (row) => row.isUnconverted.net
		},
		{
			key: 'cash',
			label: m.trends_series_cash_label(),
			color: 'var(--cash)',
			value: (row) => row.cash,
			isUnconverted: (row) => row.isUnconverted.cash
		},
		{
			key: 'debt',
			label: m.trends_series_debt_label(),
			color: 'var(--debt)',
			value: (row) => row.debt,
			isLiability: true,
			isUnconverted: (row) => row.isUnconverted.debt
		},
		{
			key: 'investment',
			label: m.trends_series_investment_label(),
			color: 'var(--investment)',
			value: (row) => row.investment,
			isUnconverted: (row) => row.isUnconverted.investment
		},
		{
			key: 'other',
			label: m.trends_series_other_label(),
			color: 'var(--other-assets)',
			value: (row) => row.other,
			isUnconverted: (row) => row.isUnconverted.other
		}
	]}
	emptyMessage={m.trends_empty()}
	formatAxisValue={(value) => formatCurrency(Math.round(value))}
	formatTooltipValue={(value) => formatCurrency(value)}
	data-growth-chart=""
/>
