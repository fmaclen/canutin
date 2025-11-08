<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AssetsBalanceGroupOptions, AssetsTypeOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import Fieldset from './fieldset.svelte';
	import FormFieldRow from './form-field-row.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const balanceTypesContext = getBalanceTypesContext();

	const ownerId = $derived(() => auth.currentUser?.model?.id);

	let name = $state('');
	let type = $state<AssetsTypeOptions | ''>('');
	let balanceGroup: AssetsBalanceGroupOptions | '' = $state('');
	let assetTypeName = $state('');
	let symbol = $state('');
	let excluded = $state(false);
	let sold = $state(false);

	// WHOLE fields
	let bookValue = $state('');
	let marketValue = $state('');

	// SHARES fields
	let quantity = $state('');
	let bookPrice = $state('');
	let marketPrice = $state('');

	const isWhole = $derived(type === AssetsTypeOptions.WHOLE);
	const isShares = $derived(type === AssetsTypeOptions.SHARES);

	async function getOrCreateBalanceType(name: string): Promise<string> {
		const trimmed = name.trim();
		if (!trimmed) throw new Error('Balance type name is required');

		// Check if it exists
		const existing = Object.values(balanceTypesContext.byId).find((bt) => bt.name === trimmed);
		if (existing) return existing.id;

		// Create new balance type
		const currentOwnerId = ownerId();
		if (!currentOwnerId) throw new Error('User not authenticated');
		const created = await pb.authedClient.collection('balanceTypes').create({
			name: trimmed,
			owner: currentOwnerId
		});
		return created.id;
	}

	async function handleSubmit() {
		const currentOwnerId = ownerId();
		if (!currentOwnerId) return;

		try {
			// Get or create balance type
			const balanceTypeId = await getOrCreateBalanceType(assetTypeName);

			// Create asset
			const assetData: Record<string, unknown> = {
				name: name.trim(),
				type: type || undefined,
				balanceGroup: balanceGroup as AssetsBalanceGroupOptions,
				balanceType: balanceTypeId,
				owner: currentOwnerId,
				symbol: symbol.trim() || undefined,
				excluded: excluded ? new Date().toISOString() : undefined,
				sold: sold ? new Date().toISOString() : undefined
			};

			const asset = await pb.authedClient.collection('assets').create(assetData);

			// Create asset balance
			const balanceData: Record<string, unknown> = {
				asset: asset.id,
				owner: currentOwnerId,
				asOf: new Date().toISOString()
			};

			if (isWhole) {
				balanceData.bookValue = bookValue ? parseFloat(bookValue) : undefined;
				balanceData.marketValue = marketValue ? parseFloat(marketValue) : undefined;
			} else if (isShares) {
				const qty = quantity ? parseFloat(quantity) : 0;
				const bp = bookPrice ? parseFloat(bookPrice) : 0;
				const mp = marketPrice ? parseFloat(marketPrice) : 0;
				balanceData.quantity = qty || undefined;
				balanceData.bookPrice = bp || undefined;
				balanceData.marketPrice = mp || undefined;
				balanceData.bookValue = qty && bp ? qty * bp : undefined;
				balanceData.marketValue = qty && mp ? qty * mp : undefined;
			}

			await pb.authedClient.collection('assetBalances').create(balanceData);

			toast.success(m.assets_add_success());
			await goto(resolve('/assets'));
		} catch (error) {
			console.error('Failed to create asset:', error);
			toast.error(m.assets_add_failed());
		}
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/assets">{m.sidebar_assets()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>Add asset</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle="Add asset">
	<Section>
		<SectionTitle title="Details" />
		<div class="bg-muted border-border overflow-hidden rounded-md border">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="name" class="justify-start pr-0 md:justify-end">Name</Label>
						<Input id="name" bind:value={name} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
							>Category</Label
						>
						<Input
							id="category"
							name="category"
							bind:value={assetTypeName}
							placeholder={m.assets_category_placeholder()}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="balance-group" class="justify-start pr-0 md:justify-end"
							>Balance group</Label
						>
						<Select.Root type="single" bind:value={balanceGroup}>
							<Select.Trigger id="balance-group" class="bg-background w-full">
								{#if balanceGroup}
									<div class="flex items-center gap-2">
										<div
											class="size-2 rounded-full {balanceGroup === AssetsBalanceGroupOptions.CASH
												? 'bg-cash'
												: balanceGroup === AssetsBalanceGroupOptions.DEBT
													? 'bg-debt'
													: balanceGroup === AssetsBalanceGroupOptions.INVESTMENT
														? 'bg-investment'
														: 'bg-other'}"
										></div>
										{#if balanceGroup === AssetsBalanceGroupOptions.CASH}
											{m.assets_group_cash_label()}
										{:else if balanceGroup === AssetsBalanceGroupOptions.DEBT}
											{m.assets_group_debt_label()}
										{:else if balanceGroup === AssetsBalanceGroupOptions.INVESTMENT}
											{m.assets_group_investment_label()}
										{:else if balanceGroup === AssetsBalanceGroupOptions.OTHER}
											{m.assets_group_other_label()}
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground"
										>{m.assets_balance_group_select_placeholder()}</span
									>
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={AssetsBalanceGroupOptions.CASH}>
									<div class="flex items-center gap-2">
										<div class="bg-cash size-2 rounded-full"></div>
										{m.assets_group_cash_label()}
									</div>
								</Select.Item>
								<Select.Item value={AssetsBalanceGroupOptions.DEBT}>
									<div class="flex items-center gap-2">
										<div class="bg-debt size-2 rounded-full"></div>
										{m.assets_group_debt_label()}
									</div>
								</Select.Item>
								<Select.Item value={AssetsBalanceGroupOptions.INVESTMENT}>
									<div class="flex items-center gap-2">
										<div class="bg-investment size-2 rounded-full"></div>
										{m.assets_group_investment_label()}
									</div>
								</Select.Item>
								<Select.Item value={AssetsBalanceGroupOptions.OTHER}>
									<div class="flex items-center gap-2">
										<div class="bg-other size-2 rounded-full"></div>
										{m.assets_group_other_label()}
									</div>
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label id="type-label" for="type" class="justify-start pr-0 md:justify-end">Type</Label>
						<Select.Root type="single" bind:value={type}>
							<Select.Trigger
								id="type"
								name="type"
								aria-labelledby="type-label"
								class="bg-background w-full"
							>
								{#if type}
									{#if type === AssetsTypeOptions.WHOLE}
										{m.assets_type_whole_label()}
									{:else if type === AssetsTypeOptions.SHARES}
										{m.assets_type_shares_label()}
									{/if}
								{:else}
									<span class="text-muted-foreground">{m.assets_type_select_placeholder()}</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={AssetsTypeOptions.WHOLE}>
									{m.assets_type_whole_label()}
								</Select.Item>
								<Select.Item value={AssetsTypeOptions.SHARES}>
									{m.assets_type_shares_label()}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					{#if isWhole || isShares}
						{#if isShares}
							<FormFieldRow>
								<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
									<Label for="symbol" class="justify-start pr-0 md:justify-end">Symbol</Label>
									<span class="text-muted-foreground text-sm">Optional</span>
								</div>
								<Input id="symbol" bind:value={symbol} />
							</FormFieldRow>
						{/if}

						{#if isWhole}
							<FormFieldRow>
								<Label for="market-value" class="justify-start pr-0 md:justify-end"
									>Market value</Label
								>
								<Input id="market-value" type="number" step="0.01" bind:value={marketValue} />
							</FormFieldRow>

							<FormFieldRow>
								<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
									<Label for="book-value" class="justify-start pr-0 md:justify-end"
										>Book value</Label
									>
									<span class="text-muted-foreground text-sm">Optional</span>
								</div>
								<Input id="book-value" type="number" step="0.01" bind:value={bookValue} />
							</FormFieldRow>
						{:else if isShares}
							<FormFieldRow>
								<Label for="quantity" class="justify-start pr-0 md:justify-end">Quantity</Label>
								<Input id="quantity" type="number" step="0.01" bind:value={quantity} />
							</FormFieldRow>

							<FormFieldRow>
								<Label for="market-price" class="justify-start pr-0 md:justify-end"
									>Market price</Label
								>
								<Input id="market-price" type="number" step="0.01" bind:value={marketPrice} />
							</FormFieldRow>

							<FormFieldRow>
								<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
									<Label for="book-price" class="justify-start pr-0 md:justify-end"
										>Book price</Label
									>
									<span class="text-muted-foreground text-sm">Optional</span>
								</div>
								<Input id="book-price" type="number" step="0.01" bind:value={bookPrice} />
							</FormFieldRow>
						{/if}
					{/if}
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5">Marked as</Label>
						<div class="space-y-2">
							<Label
								for="excluded"
								class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
							>
								<Checkbox id="excluded" bind:checked={excluded} class="bg-background" />
								<span>Exclude from net worth</span>
							</Label>
							<Label
								for="sold"
								class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
							>
								<Checkbox id="sold" bind:checked={sold} class="bg-background" />
								<span>Sold</span>
							</Label>
						</div>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">Add</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
