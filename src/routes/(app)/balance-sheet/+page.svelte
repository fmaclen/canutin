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
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
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

	const grouped = $derived.by(() => {
		type Item = {
			id: string;
			name: string;
			balance: number | null;
			excluded: boolean;
			type: 'account' | 'asset';
			isShared: boolean;
		};
		type BalanceType = { id: string; name: string; total: number | null; items: Item[] };
		type Group = { total: number | null; types: BalanceType[] };

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
				entry = { id: key, name, total: null, items: [] };
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
				balance: a.balance,
				excluded: a.participantExcluded,
				type: 'account',
				isShared: a.isShared
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
				balance: a.marketValue ?? 0,
				excluded: a.participantExcluded,
				type: 'asset',
				isShared: a.isShared
			});
		}

		const groups: Record<BalanceGroup, Group> = {
			CASH: { total: null, types: [] },
			DEBT: { total: null, types: [] },
			INVESTMENT: { total: null, types: [] },
			OTHER: { total: null, types: [] }
		};
		for (const g of Object.keys(typeMaps) as BalanceGroup[]) {
			const types = Array.from(typeMaps[g].values());
			for (const balanceType of types) {
				balanceType.total = sumOrUnknown(
					balanceType.items.filter((item) => !item.excluded).map((item) => item.balance)
				);
			}
			groups[g].types = types.sort((a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0));
			groups[g].total = sumOrUnknown(types.map((balanceType) => balanceType.total));
		}

		return groups;
	});
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.sidebar_balance_sheet()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle="Balance sheet">
	<Section>
		<SectionTitle title="Balances" />
		<div class="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
			{#each balanceGroups as balanceGroup (balanceGroup)}
				<div class="balances-cell flex w-full flex-col gap-3" data-testid={balanceGroup}>
					<KeyValue
						title={groupTitle(balanceGroup)}
						value={grouped[balanceGroup].total}
						variant={groupVariant(balanceGroup)}
					/>
					{#if isLoading}
						<Skeleton class="min-h-32" />
					{:else if grouped[balanceGroup].types.length === 0}
						<Empty>{m.balance_sheet_group_empty()}</Empty>
					{:else}
						{#each grouped[balanceGroup].types as balanceType (balanceType.id)}
							<div
								class="bg-background overflow-hidden rounded-sm shadow-md"
								role="region"
								aria-label={balanceType.name}
							>
								<div class="flex items-center justify-between border-b px-4 py-3.5">
									<div class="text-sm font-medium">{balanceType.name}</div>
									<div class="font-mono tabular-nums">
										{#if balanceType.total === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency value={balanceType.total} />
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
													<Currency value={item.balance} />
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
