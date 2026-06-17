<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox, type ComboboxItem } from '$lib/components/ui/combobox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { m } from '$lib/paraglide/messages';
	import { SecurityTransactionsTypeOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { tradeTypeLabel } from '$lib/trade-display';
	import { toNumber } from '$lib/utils';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed && a.canWrite));
	const typeOptions = Object.values(SecurityTransactionsTypeOptions);

	let accountId = $state('');
	let securityId = $state('');
	let date = $state('');
	let type = $state<SecurityTransactionsTypeOptions>(SecurityTransactionsTypeOptions.buy);
	let subtype = $state('');
	let description = $state('');
	let quantity = $state('');
	let price = $state('');
	let amount = $state('');
	let fees = $state('');
	let notes = $state('');
	let isSaving = $state(false);

	const selectedSecurity = $derived(
		securityId ? securitiesContext.securities.find((security) => security.id === securityId) : null
	);
	const securityItems = $derived(
		securitiesContext.securities.map(
			(security): ComboboxItem => ({
				value: security.id,
				label: security.name,
				keywords: security.symbol ? [security.symbol] : undefined
			})
		)
	);

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || isSaving) return;
		if (!accountId) {
			toast.error(m.account_required());
			return;
		}
		if (!selectedSecurity) {
			toast.error(m.trades_security_required());
			return;
		}
		if (!description.trim()) {
			toast.error(m.trades_description_required());
			return;
		}

		try {
			isSaving = true;
			await pb.authedClient.collection('securityTransactions').create({
				account: accountId,
				security: selectedSecurity.id,
				owner: currentOwnerId,
				date: new Date(date + 'T12:00:00Z').toISOString(),
				type,
				subtype: subtype.trim() || undefined,
				description: description.trim(),
				quantity: toNumber(quantity),
				price: toNumber(price),
				amount: toNumber(amount),
				fees: toNumber(fees),
				notes: notes.trim() || undefined
			});

			toast.success(m.trades_add_success());
			await goto(resolve('/trades'));
		} catch (error) {
			console.error('[tradesAdd]', error);
			toast.error(m.trades_add_failed());
		} finally {
			isSaving = false;
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
					<Breadcrumb.Link href={resolve('/trades')}>
						{m.trades_title()}
					</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.trades_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.trades_add_page_title()}>
	<Section>
		<SectionTitle title={m.transactions_section_details()} />

		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="account" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_account()}
						</Label>
						<AccountPicker
							accounts={openAccounts}
							bind:value={accountId}
							id="account"
							placeholder={m.transactions_account_select_placeholder()}
							disabled={isSaving}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="date" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_date()}
						</Label>
						<Input id="date" type="date" bind:value={date} disabled={isSaving} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="security" class="justify-start pr-0 md:justify-end">
							{m.trades_label_security()}
						</Label>
						<Combobox
							id="security"
							ariaLabel={m.trades_label_security()}
							items={securityItems}
							bind:value={securityId}
							placeholder={m.trades_security_select_placeholder()}
							isLoading={securitiesContext.isLoading}
							emptyText={m.trades_securities_empty()}
							disabled={isSaving}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="description" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_description()}
						</Label>
						<Input id="description" bind:value={description} disabled={isSaving} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="type" class="justify-start pr-0 md:justify-end">
							{m.trades_label_type()}
						</Label>
						<Select.Root type="single" bind:value={type} disabled={isSaving}>
							<Select.Trigger id="type" class="bg-background w-full">
								{tradeTypeLabel(type)}
							</Select.Trigger>
							<Select.Content>
								{#each typeOptions as option (option)}
									<Select.Item value={option}>{tradeTypeLabel(option)}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="subtype" class="justify-start pr-0 md:justify-end">
								{m.trades_label_subtype()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<Input id="subtype" bind:value={subtype} disabled={isSaving} />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="quantity" class="justify-start pr-0 md:justify-end">
								{m.trades_label_quantity()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField
							id="quantity"
							name="quantity"
							bind:value={quantity}
							disabled={isSaving}
							isCurrency={false}
						/>
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="price" class="justify-start pr-0 md:justify-end">
								{m.trades_label_price()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField id="price" name="price" bind:value={price} disabled={isSaving} />
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="amount" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_amount()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField id="amount" name="amount" bind:value={amount} disabled={isSaving} />
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="fees" class="justify-start pr-0 md:justify-end">
								{m.trades_label_fees()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<CurrencyField id="fees" name="fees" bind:value={fees} disabled={isSaving} />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2">
							<Label for="notes" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_notes()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<Textarea id="notes" bind:value={notes} class="bg-background" disabled={isSaving} />
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={isSaving}>{m.transactions_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
