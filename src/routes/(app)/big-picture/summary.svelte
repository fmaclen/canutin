<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import { m } from '$lib/paraglide/messages';
	import { sumPartial } from '$lib/utils';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	// NOTE: big picture hides the converted-amount indicator (page-scoped FX rule); its totals use
	// the display-currency account and asset values and mark unavailable values as partial.
	const totals = $derived.by(() => {
		const groups: Record<BalanceGroup, Array<number | null>> = {
			CASH: [],
			DEBT: [],
			INVESTMENT: [],
			OTHER: []
		};
		const hasMixedAccounts: Record<BalanceGroup, boolean> = {
			CASH: false,
			DEBT: false,
			INVESTMENT: false,
			OTHER: false
		};

		for (const a of accountsContext.accounts) {
			if (a.participantExcluded || a.closed) continue;
			const group = a.balanceGroup as BalanceGroup;
			groups[group].push(a.displayBalance);
			hasMixedAccounts[group] ||= a.isUnconverted;
		}
		for (const a of assetsContext.assets)
			if (!a.participantExcluded && !a.sold)
				groups[a.balanceGroup as BalanceGroup].push(a.isUnconverted ? null : a.displayMarketValue);

		const totalsByGroup = {
			CASH: sumPartial(groups.CASH),
			DEBT: sumPartial(groups.DEBT),
			INVESTMENT: sumPartial(groups.INVESTMENT),
			OTHER: sumPartial(groups.OTHER)
		};
		for (const group of Object.keys(groups) as BalanceGroup[])
			totalsByGroup[group].isPartial ||= hasMixedAccounts[group];

		const netWorth = sumPartial([
			...groups.CASH,
			...groups.DEBT,
			...groups.INVESTMENT,
			...groups.OTHER
		]);
		netWorth.isPartial ||= Object.values(hasMixedAccounts).some(Boolean);

		return { totalsByGroup, netWorth } as const;
	});
</script>

<div class="grid gap-2 text-white lg:grid-cols-[1.3fr_1fr_1fr]">
	<div
		class="flex flex-col justify-between rounded-sm bg-stone-700 p-4 shadow-md md:row-span-2"
		role="region"
		aria-label={m.big_picture_summary_net_worth()}
	>
		<div class="text-sm leading-none font-semibold tracking-tight">
			{m.big_picture_summary_net_worth()}
		</div>
		<div class="translate-y-1.5 text-4xl">
			{#if totals.netWorth.total === null}
				<span class="text-white/70">~</span>
			{:else}
				<Currency
					value={totals.netWorth.total}
					isPartial={totals.netWorth.isPartial}
					onColoredSurface
				/>
			{/if}
		</div>
	</div>
	<KeyValue
		title={m.big_picture_summary_cash()}
		value={totals.totalsByGroup.CASH.total}
		variant="cash"
		isPartial={totals.totalsByGroup.CASH.isPartial}
	/>
	<KeyValue
		title={m.big_picture_summary_investments()}
		value={totals.totalsByGroup.INVESTMENT.total}
		variant="investment"
		isPartial={totals.totalsByGroup.INVESTMENT.isPartial}
	/>
	<KeyValue
		title={m.big_picture_summary_debt()}
		value={totals.totalsByGroup.DEBT.total}
		variant="debt"
		isPartial={totals.totalsByGroup.DEBT.isPartial}
	/>
	<KeyValue
		title={m.big_picture_summary_other_assets()}
		value={totals.totalsByGroup.OTHER.total}
		variant="other"
		isPartial={totals.totalsByGroup.OTHER.isPartial}
	/>
</div>
