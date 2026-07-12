<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import { sumOrUnknown } from '$lib/security-balance-values';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';
	type GroupTotal = { value: number | null; isUnconverted: boolean };

	// NOTE: big picture hides the converted-amount indicator (page-scoped FX rule), so only the
	// unconvertible warning bubbles up here; accounts/assets still carry their own display-currency
	// conversion (displayBalance/displayMarketValue), this just sums those.
	const totals = $derived.by(() => {
		const groups: Record<BalanceGroup, { values: Array<number | null>; isUnconverted: boolean }> = {
			CASH: { values: [], isUnconverted: false },
			DEBT: { values: [], isUnconverted: false },
			INVESTMENT: { values: [], isUnconverted: false },
			OTHER: { values: [], isUnconverted: false }
		};

		const addValue = (group: BalanceGroup, value: number | null, isUnconverted: boolean) => {
			const bucket = groups[group];
			bucket.values.push(value);
			if (value === null) return;
			bucket.isUnconverted ||= isUnconverted;
		};

		for (const a of accountsContext.accounts)
			if (!a.participantExcluded && !a.closed)
				addValue(a.balanceGroup as BalanceGroup, a.displayBalance, a.isUnconverted);
		for (const a of assetsContext.assets)
			if (!a.participantExcluded && !a.sold)
				addValue(a.balanceGroup as BalanceGroup, a.displayMarketValue, a.isUnconverted);

		const toGroupTotal = (group: BalanceGroup) => ({
			value: sumOrUnknown(groups[group].values),
			isUnconverted: groups[group].isUnconverted
		});

		const totalsByGroup: Record<BalanceGroup, GroupTotal> = {
			CASH: toGroupTotal('CASH'),
			DEBT: toGroupTotal('DEBT'),
			INVESTMENT: toGroupTotal('INVESTMENT'),
			OTHER: toGroupTotal('OTHER')
		};

		const netWorth: GroupTotal = {
			value: sumOrUnknown([
				...groups.CASH.values,
				...groups.DEBT.values,
				...groups.INVESTMENT.values,
				...groups.OTHER.values
			]),
			isUnconverted: Object.values(groups).some((group) => group.isUnconverted)
		};

		return { totalsByGroup, netWorth } as const;
	});
</script>

<div class="grid gap-2 text-white lg:grid-cols-[1.3fr_1fr_1fr]">
	<div
		class="flex flex-col justify-between rounded-sm bg-stone-700 p-4 shadow-md md:row-span-2"
		role="region"
		aria-label="Net worth"
	>
		<div class="text-sm leading-none font-semibold tracking-tight">Net worth</div>
		<div class="translate-y-1.5 text-4xl">
			{#if totals.netWorth.value === null}
				<span class="text-white/70">~</span>
			{:else}
				<Currency
					value={totals.netWorth.value}
					isUnconverted={totals.netWorth.isUnconverted}
					onColoredSurface
				/>
			{/if}
		</div>
	</div>
	<KeyValue
		title="Cash"
		value={totals.totalsByGroup.CASH.value}
		variant="cash"
		isUnconverted={totals.totalsByGroup.CASH.isUnconverted}
	/>
	<KeyValue
		title="Investments"
		value={totals.totalsByGroup.INVESTMENT.value}
		variant="investment"
		isUnconverted={totals.totalsByGroup.INVESTMENT.isUnconverted}
	/>
	<KeyValue
		title="Debt"
		value={totals.totalsByGroup.DEBT.value}
		variant="debt"
		isUnconverted={totals.totalsByGroup.DEBT.isUnconverted}
	/>
	<KeyValue
		title="Other assets"
		value={totals.totalsByGroup.OTHER.value}
		variant="other"
		isUnconverted={totals.totalsByGroup.OTHER.isUnconverted}
	/>
</div>
