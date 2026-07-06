<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
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
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { AssetsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const balanceTypesContext = getBalanceTypesContext();
	const currenciesContext = getCurrenciesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const currencyOptions = $derived(currenciesContext.currencyOptions);

	let name = $state('');
	let balanceGroup: AssetsBalanceGroupOptions | '' = $state('');
	let balanceTypeName = $state('');
	let notes = $state('');
	let excluded = $state(false);
	let sold = $state(false);
	let currency = $state(interfacePreferences.displayCurrency);
	let currencyWasChanged = $state(false);
	let bookValue = $state('');
	let marketValue = $state('');

	const selectedCurrency = $derived(currenciesContext.getCurrency(currency));

	$effect(() => {
		if (!currencyWasChanged) {
			currency = interfacePreferences.displayCurrency;
		}
	});

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;
		if (!currenciesContext.hasCurrency(currency)) {
			toast.error(m.currency_required());
			return;
		}

		try {
			const balanceTypeId = await balanceTypesContext.getOrCreate(balanceTypeName, currentOwnerId);

			const assetData: Record<string, unknown> = {
				name: name.trim(),
				balanceGroup: balanceGroup || undefined,
				balanceType: balanceTypeId,
				currency,
				owner: currentOwnerId,
				notes: notes.trim() || undefined,
				excluded: excluded ? new Date().toISOString() : undefined,
				sold: sold ? new Date().toISOString() : undefined
			};

			const asset = await pb.authedClient.collection('assets').create(assetData);

			const balanceData: Record<string, unknown> = {
				asset: asset.id,
				owner: currentOwnerId,
				asOf: new Date().toISOString(),
				bookValue: bookValue ? parseFloat(bookValue) : undefined,
				marketValue: marketValue ? parseFloat(marketValue) : undefined
			};

			await pb.authedClient.collection('assetBalances').create(balanceData);

			toast.success(m.assets_add_success());
			await goto(resolve('/assets'));
		} catch (error) {
			logError('addAsset', 'create', error);
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
					<Breadcrumb.Page>{m.assets_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.assets_add_page_title()}>
	<Section>
		<SectionTitle title={m.assets_section_details()} />
		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="name" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_name()}</Label
						>
						<Input id="name" bind:value={name} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_category()}</Label
						>
						<Input
							id="category"
							name="category"
							bind:value={balanceTypeName}
							placeholder={m.assets_category_placeholder()}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="balance-group" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_balance_group()}</Label
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
														: 'bg-other-assets'}"
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
										<div class="bg-other-assets size-2 rounded-full"></div>
										{m.assets_group_other_label()}
									</div>
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="currency" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_currency()}</Label
						>
						<Select.Root
							type="single"
							value={currency}
							onValueChange={(value) => {
								currency = value;
								currencyWasChanged = true;
							}}
						>
							<Select.Trigger id="currency" class="bg-background w-full">
								{#if selectedCurrency}
									<div class="flex min-w-0 items-center gap-2">
										<span>{selectedCurrency.code}</span>
										{#if selectedCurrency.name}
											<span class="text-muted-foreground truncate">{selectedCurrency.name}</span>
										{/if}
									</div>
								{:else if currency}
									{currency}
								{:else}
									<span class="text-muted-foreground">{m.currencies_select_placeholder()}</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#if currencyOptions.length === 0}
									<Select.Item value="__no-currencies" disabled>
										{m.currencies_select_empty()}
									</Select.Item>
								{:else}
									{#each currencyOptions as option (option.value)}
										<Select.Item value={option.value}>
											<div class="flex min-w-0 items-center gap-2">
												<span>{option.code}</span>
												{#if option.name}
													<span class="text-muted-foreground truncate">{option.name}</span>
												{/if}
											</div>
										</Select.Item>
									{/each}
								{/if}
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow itemsAlignment="items-start">
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2">
							<Label for="notes" class="justify-start pr-0 md:justify-end"
								>{m.assets_label_notes()}</Label
							>
							<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
						</div>
						<Textarea id="notes" bind:value={notes} class="bg-background" />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label for="market-value" class="justify-start pr-0 md:justify-end"
							>{m.assets_label_market_value()}</Label
						>
						<CurrencyField
							id="market-value"
							name="market-value"
							bind:value={marketValue}
							{currency}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="book-value" class="justify-start pr-0 md:justify-end"
								>{m.assets_label_book_value()}</Label
							>
							<span class="text-muted-foreground text-sm">{m.assets_text_optional()}</span>
						</div>
						<CurrencyField id="book-value" name="book-value" bind:value={bookValue} {currency} />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
							>{m.assets_label_marked_as()}</Label
						>
						<div class="space-y-2">
							<Label
								for="excluded"
								class="flex h-9 cursor-pointer items-center gap-2 rounded border px-3 py-1 font-normal"
							>
								<Checkbox id="excluded" bind:checked={excluded} class="bg-background" />
								<span>{m.assets_label_exclude_from_net_worth()}</span>
							</Label>
							<Label
								for="sold"
								class="flex h-9 cursor-pointer items-center gap-2 rounded border px-3 py-1 font-normal"
							>
								<Checkbox id="sold" bind:checked={sold} class="bg-background" />
								<span>{m.assets_label_sold()}</span>
							</Label>
						</div>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.assets_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
