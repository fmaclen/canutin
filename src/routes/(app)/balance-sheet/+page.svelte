<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Page from '$lib/components/page.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/paraglide/messages';
	import { sumOrUnknown } from '$lib/security-balance-values';

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	const balanceGroups: BalanceGroup[] = ['CASH', 'DEBT', 'INVESTMENT', 'OTHER'];
	const isLoading = $derived(accountsContext.isLoading || assetsContext.isLoading);

	function groupTitle(group: BalanceGroup) {
		return group === 'CASH'
			? 'Cash'
			: group === 'DEBT'
				? 'Debt'
				: group === 'INVESTMENT'
					? 'Investments'
					: 'Other assets';
	}

	function groupVariant(group: BalanceGroup) {
		return group === 'CASH'
			? 'cash'
			: group === 'DEBT'
				? 'debt'
				: group === 'INVESTMENT'
					? 'investment'
					: 'other';
	}

	// NOTE: accounts/assets already carry their own display-currency conversion
	// (displayBalance/displayMarketValue + isConverted/isUnconverted); this just groups and
	// sums those.
	const grouped = $derived.by(() => {
		type Item = {
			id: string;
			name: string;
			balance: number | null;
			excluded: boolean;
			type: 'account' | 'asset';
			isShared: boolean;
			isConverted: boolean;
			isUnconverted: boolean;
			missingCurrency: string | null;
			nativeCurrency: string;
			nativeValue: number | null;
		};
		type BalanceType = {
			id: string;
			name: string;
			total: number | null;
			isUnconverted: boolean;
			items: Item[];
		};
		type Group = {
			total: number | null;
			isUnconverted: boolean;
			types: BalanceType[];
		};

		const typeMaps: Record<BalanceGroup, Map<string, BalanceType>> = {
			CASH: new Map(),
			DEBT: new Map(),
			INVESTMENT: new Map(),
			OTHER: new Map()
		};

		function upsert(group: BalanceGroup, typeId: string, name: string) {
			const map = typeMaps[group];
			const trimmed = name.trim();
			const key =
				!trimmed || trimmed === '(Unknown)' ? `id:${typeId}` : `name:${trimmed.toLowerCase()}`;
			let entry = map.get(key);
			if (!entry) {
				entry = { id: key, name, total: null, isUnconverted: false, items: [] };
				map.set(key, entry);
			}
			return entry;
		}

		for (const a of accountsContext.accounts) {
			if (a.closed) continue;
			const balanceType = upsert(
				a.balanceGroup as BalanceGroup,
				a.balanceType,
				accountsContext.getTypeName(a.balanceType)
			);
			balanceType.items.push({
				id: a.id,
				name: a.name,
				balance: a.displayBalance,
				excluded: a.participantExcluded,
				type: 'account',
				isShared: a.isShared,
				isConverted: a.isConverted,
				isUnconverted: a.isUnconverted,
				missingCurrency: a.missingCurrency,
				nativeCurrency: a.currency,
				nativeValue: a.balance
			});
		}

		for (const a of assetsContext.assets) {
			if (a.sold) continue;
			const balanceType = upsert(
				a.balanceGroup as BalanceGroup,
				a.balanceType,
				assetsContext.getTypeName(a.balanceType)
			);
			balanceType.items.push({
				id: a.id,
				name: a.name,
				balance: a.displayMarketValue,
				excluded: a.participantExcluded,
				type: 'asset',
				isShared: a.isShared,
				isConverted: a.isConverted,
				isUnconverted: a.isUnconverted,
				missingCurrency: a.missingCurrency,
				nativeCurrency: a.currency,
				nativeValue: a.marketValue
			});
		}

		const groups: Record<BalanceGroup, Group> = {
			CASH: { total: null, isUnconverted: false, types: [] },
			DEBT: { total: null, isUnconverted: false, types: [] },
			INVESTMENT: { total: null, isUnconverted: false, types: [] },
			OTHER: { total: null, isUnconverted: false, types: [] }
		};
		for (const g of Object.keys(typeMaps) as BalanceGroup[]) {
			const types = Array.from(typeMaps[g].values());
			for (const balanceType of types) {
				const included = balanceType.items.filter((item) => !item.excluded);
				balanceType.total = sumOrUnknown(included.map((item) => item.balance));
				balanceType.isUnconverted = included.some((item) => item.isUnconverted);
			}
			groups[g].types = types.sort((a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0));
			groups[g].total = sumOrUnknown(types.map((balanceType) => balanceType.total));
			groups[g].isUnconverted = types.some((balanceType) => balanceType.isUnconverted);
		}

		return groups;
	});
</script>

<Page pageTitle={m.sidebar_balance_sheet()}>
	<Section>
		<SectionTitle title={m.balance_sheet_section_balances()} />
		<div
			class="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-4"
			style="--currency-unconverted-color: currentColor; --currency-unconverted-border-width: 0"
		>
			{#each balanceGroups as balanceGroup (balanceGroup)}
				<div class="balances-cell flex w-full flex-col gap-3" data-testid={balanceGroup}>
					<KeyValue
						title={groupTitle(balanceGroup)}
						value={grouped[balanceGroup].total}
						variant={groupVariant(balanceGroup)}
						isUnconverted={grouped[balanceGroup].isUnconverted}
					/>
					{#if isLoading}
						<Skeleton class="min-h-32" showSpinner />
					{:else if grouped[balanceGroup].types.length === 0}
						<Empty>{m.balance_sheet_group_empty()}</Empty>
					{:else}
						{#each grouped[balanceGroup].types as balanceType (balanceType.id)}
							<div
								class="bg-background overflow-hidden rounded-sm shadow-md"
								role="region"
								aria-label={balanceType.name}
								style="--currency-unconverted-color: var(--color-muted-foreground); --currency-unconverted-border-width: 1px"
							>
								<div class="flex items-center justify-between border-b px-4 py-3.5">
									<div class="text-sm font-medium">{balanceType.name}</div>
									<div class="font-mono tabular-nums">
										{#if balanceType.total === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency
												value={balanceType.total}
												isUnconverted={balanceType.isUnconverted}
											/>
										{/if}
									</div>
								</div>
								<ul>
									{#each balanceType.items as item (item.id)}
										<li
											class="odd:bg-sidebar flex items-center justify-between gap-2 border-b border-dashed px-4 py-3 text-balance last:border-b-0"
										>
											<RecordLink
												type={item.type}
												id={item.id}
												name={item.name}
												isShared={item.isShared}
												class={'text-sm ' +
													(item.excluded ? 'text-muted-foreground' : 'text-foreground/90')}
											/>
											<span
												class={'font-mono tabular-nums ' +
													(item.excluded ? 'text-muted-foreground' : '')}
											>
												{#if item.balance === null}
													<span class="text-muted-foreground">~</span>
												{:else}
													<Currency
														value={item.balance}
														isConverted={item.isConverted}
														isUnconverted={item.isUnconverted}
														missingCurrency={item.missingCurrency}
														nativeCurrency={item.nativeCurrency}
														nativeValue={item.nativeValue ?? undefined}
													/>
												{/if}
											</span>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					{/if}
				</div>
			{/each}
		</div>
	</Section>
</Page>
