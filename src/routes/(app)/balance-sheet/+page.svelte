<script lang="ts">
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAssetsContext } from '$lib/assets.svelte';
	import Currency from '$lib/components/currency.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';

	type BalanceGroup = 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';

	const accountsContext = getAccountsContext();
	const assetsContext = getAssetsContext();

	const balanceGroups: BalanceGroup[] = ['CASH', 'DEBT', 'INVESTMENT', 'OTHER'];

	function groupTitle(group: BalanceGroup) {
		return group === 'CASH'
			? 'Cash'
			: group === 'DEBT'
				? 'Debt'
				: group === 'INVESTMENT'
					? 'Investments'
					: 'Other assets';
	}

	function groupClass(group: BalanceGroup) {
		return group === 'CASH'
			? 'bg-cash'
			: group === 'DEBT'
				? 'bg-debt'
				: group === 'INVESTMENT'
					? 'bg-investment'
					: 'bg-other';
	}

	const grouped = $derived.by(() => {
		const groups: Record<
			BalanceGroup,
			{
				total: number;
				types: Array<{
					id: string;
					name: string;
					total: number;
					items: Array<{ id: string; name: string; balance: number; excluded: boolean }>;
				}>;
			}
		> = {
			CASH: { total: 0, types: [] },
			DEBT: { total: 0, types: [] },
			INVESTMENT: { total: 0, types: [] },
			OTHER: { total: 0, types: [] }
		};

		const typeMaps: Record<BalanceGroup, Map<string, (typeof groups)['CASH']['types'][number]>> = {
			CASH: new Map(),
			DEBT: new Map(),
			INVESTMENT: new Map(),
			OTHER: new Map()
		};

		function upsert(group: BalanceGroup, typeId: string, name: string) {
			const map = typeMaps[group];
			let entry = map.get(typeId);
			if (!entry) {
				entry = { id: typeId, name, total: 0, items: [] };
				map.set(typeId, entry);
			}
			return entry;
		}

		for (const a of accountsContext.accounts) {
			if (a.closed) continue;
			const group = a.balanceGroup as BalanceGroup;
			if (!a.excluded) groups[group].total += a.balance ?? 0;
			const type = upsert(group, a.balanceType, accountsContext.getTypeName(a.balanceType));
			if (!a.excluded) type.total += a.balance ?? 0;
			type.items = [
				...type.items,
				{ id: a.id, name: a.name, balance: a.balance ?? 0, excluded: Boolean(a.excluded) }
			];
		}

		for (const a of assetsContext.assets) {
			if (a.sold) continue;
			const group = a.balanceGroup as BalanceGroup;
			if (!a.excluded) groups[group].total += a.balance ?? 0;
			const type = upsert(group, a.balanceType, assetsContext.getTypeName(a.balanceType));
			if (!a.excluded) type.total += a.balance ?? 0;
			type.items = [
				...type.items,
				{ id: a.id, name: a.name, balance: a.balance ?? 0, excluded: Boolean(a.excluded) }
			];
		}

		for (const g of Object.keys(typeMaps) as BalanceGroup[]) {
			groups[g].types = Array.from(typeMaps[g].values()).sort(
				(a, b) => Math.abs(b.total) - Math.abs(a.total)
			);
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

<div class="flex flex-col space-y-2 p-8">
	<SectionTitle title="Balances" />
	<div
		class="grid gap-x-4 gap-y-6 md:grid-cols-[1fr_auto_1fr_auto] xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"
	>
		{#each balanceGroups as balanceGroup, index (balanceGroup)}
			{#if index > 0}
				<Separator orientation="horizontal" class="block md:hidden" />
				<Separator orientation="vertical" class="hidden md:block" />
			{/if}
			<div class="flex w-full flex-col gap-4" data-testid={balanceGroup}>
				<KeyValue
					title={groupTitle(balanceGroup)}
					value={grouped[balanceGroup].total}
					className={`${groupClass(balanceGroup)} text-background`}
				/>
				{#each grouped[balanceGroup].types as balanceType (balanceType.id)}
					<div
						class="bg-background overflow-hidden rounded-sm shadow-md"
						role="region"
						aria-label={balanceType.name}
					>
						<div class="flex items-center justify-between border-b p-4">
							<div class="text-sm font-medium">{balanceType.name}</div>
							<div class="font-mono text-sm tabular-nums">
								<Currency value={balanceType.total} />
							</div>
						</div>
						<ul>
							{#each balanceType.items as item (item.id)}
								<li
									class="odd:bg-sidebar flex items-center justify-between gap-2 border-b px-4 py-3 text-balance last:border-b-0"
								>
									<span
										class={'text-sm ' +
											(item.excluded ? 'text-muted-foreground' : 'text-foreground/90')}
									>
										{item.name}
									</span>
									<span
										class={'font-mono text-xs tabular-nums ' +
											(item.excluded ? 'text-muted-foreground' : '')}
									>
										<Currency value={item.balance} />
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
