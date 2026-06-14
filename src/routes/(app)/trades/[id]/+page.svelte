<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import SharedRecordReadonlyBanner from '$lib/components/shared-record-readonly-banner.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { m } from '$lib/paraglide/messages';
	import {
		SecurityTransactionsTypeOptions,
		type SecuritiesResponse,
		type SecurityTransactionsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { tradeTypeLabel } from '$lib/trade-display';
	import { sanitizeFromParam, toNumber } from '$lib/utils';

	type TradeResponse = SecurityTransactionsResponse<
		number,
		number,
		number,
		number,
		{ security?: SecuritiesResponse }
	>;

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const tradeId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed));
	const editableAccounts = $derived(openAccounts.filter((a) => a.canWrite));
	const typeOptions = Object.values(SecurityTransactionsTypeOptions);

	let trade = $state<TradeResponse | null>(null);
	let isLoading = $state(true);

	let formData = $state<{
		accountId: string;
		securityId: string;
		date: string;
		type: SecurityTransactionsTypeOptions;
		subtype: string;
		description: string;
		quantity: string;
		price: string;
		amount: string;
		fees: string;
		notes: string;
	}>({
		accountId: '',
		securityId: '',
		date: '',
		type: SecurityTransactionsTypeOptions.buy,
		subtype: '',
		description: '',
		quantity: '',
		price: '',
		amount: '',
		fees: '',
		notes: ''
	});

	const selectedAccount = $derived(openAccounts.find((a) => a.id === formData.accountId));
	// NOTE: shared trades can reference a sharer-owned security that is absent from
	// the viewer's securities context, so fall back to the record's expanded security
	const selectedSecurity = $derived(
		securitiesContext.securities.find((security) => security.id === formData.securityId) ??
			(trade?.security === formData.securityId ? trade.expand?.security : null) ??
			null
	);
	const canWrite = $derived(Boolean(trade?.owner && ownerId && trade.owner === ownerId));

	$effect(() => {
		if (tradeId && ownerId) {
			loadTrade();
		}
	});

	async function loadTrade() {
		if (!tradeId || !ownerId) return;
		try {
			isLoading = true;
			const result = await pb.authedClient
				.collection('securityTransactions')
				.getOne<TradeResponse>(tradeId, {
					expand: 'security'
				});
			trade = result;

			const dateObj = new Date(result.date);
			const year = dateObj.getUTCFullYear();
			const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
			const day = String(dateObj.getUTCDate()).padStart(2, '0');
			const localDate = `${year}-${month}-${day}`;

			formData = {
				accountId: result.account,
				securityId: result.security,
				date: localDate,
				type: result.type,
				subtype: result.subtype ?? '',
				description: result.description ?? '',
				quantity: result.quantity?.toString() ?? '',
				price: result.price?.toString() ?? '',
				amount: result.amount?.toString() ?? '',
				fees: result.fees?.toString() ?? '',
				notes: result.notes ?? ''
			};
		} catch (error) {
			console.error('[tradeDetail] Failed to load trade:', error);
			toast.error(m.trades_edit_error_loading());
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit() {
		const currentTradeId = tradeId;
		const currentOwnerId = ownerId;
		if (!currentTradeId || !currentOwnerId || !canWrite) return;
		if (!formData.accountId) {
			toast.error(m.account_required());
			return;
		}
		if (!formData.securityId) {
			toast.error(m.trades_security_required());
			return;
		}

		try {
			await pb.authedClient.collection('securityTransactions').update(currentTradeId, {
				account: formData.accountId,
				security: formData.securityId,
				date: new Date(formData.date + 'T12:00:00Z').toISOString(),
				type: formData.type,
				subtype: formData.subtype.trim() || undefined,
				description: formData.description.trim() || undefined,
				quantity: toNumber(formData.quantity),
				price: toNumber(formData.price),
				amount: toNumber(formData.amount),
				fees: toNumber(formData.fees),
				notes: formData.notes.trim() || undefined
			});

			trade = {
				...trade!,
				description: formData.description.trim(),
				notes: formData.notes.trim()
			};
			toast.success(m.trades_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			console.error('[tradeDetail] Failed to update trade:', error);
			toast.error(m.trades_edit_failed());
		}
	}

	async function handleDelete() {
		const currentTradeId = tradeId;
		if (!currentTradeId || !canWrite) return;

		try {
			await pb.authedClient.collection('securityTransactions').delete(currentTradeId);
			toast.success(m.trades_delete_success());
			goto(resolve('/trades'));
		} catch (error) {
			console.error('[tradeDetail] Failed to delete trade:', error);
			toast.error(m.trades_delete_failed());
		}
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/trades')}>{m.trades_title()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if isLoading || !trade}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page>{trade.description || m.trades_breadcrumb_fallback()}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="flex items-center gap-4 px-4">
		{#if selectedAccount}
			<RecordLink
				type="account"
				id={selectedAccount.id}
				name={selectedAccount.name}
				isShared={selectedAccount.isShared}
				class="text-sm"
			/>
		{/if}
	</nav>
</header>

<Page pageTitle={m.trades_edit_page_title()}>
	{#if !isLoading && trade && !canWrite}
		<Section>
			<SharedRecordReadonlyBanner title={m.trades_readonly_title()} />
		</Section>
	{/if}
	<Section>
		<SectionTitle title={m.transactions_section_details()} />
		{#if isLoading || !trade}
			<Skeleton class="h-96" />
		{:else}
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
								accounts={editableAccounts}
								bind:value={formData.accountId}
								selectedAccount={selectedAccount ?? null}
								id="account"
								disabled={!canWrite}
								placeholder={m.transactions_account_select_placeholder()}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="date" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_date()}
							</Label>
							<Input
								id="date"
								type="date"
								bind:value={formData.date}
								required
								disabled={!canWrite}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="security" class="justify-start pr-0 md:justify-end">
								{m.trades_label_security()}
							</Label>
							<Select.Root type="single" bind:value={formData.securityId} disabled={!canWrite}>
								<Select.Trigger id="security" class="bg-background w-full">
									{#if selectedSecurity}
										{selectedSecurity.name}
									{:else}
										<span class="text-muted-foreground">
											{m.trades_security_select_placeholder()}
										</span>
									{/if}
								</Select.Trigger>
								<Select.Content>
									{#if securitiesContext.isLoading}
										<Select.Item value="__loading_securities__" disabled>
											{m.trades_securities_loading()}
										</Select.Item>
									{:else if securitiesContext.securities.length === 0}
										<Select.Item value="__empty_securities__" disabled>
											{m.trades_securities_empty()}
										</Select.Item>
									{:else}
										{#each securitiesContext.securities as security (security.id)}
											<Select.Item value={security.id}>{security.name}</Select.Item>
										{/each}
									{/if}
								</Select.Content>
							</Select.Root>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="type" class="justify-start pr-0 md:justify-end">
								{m.trades_label_type()}
							</Label>
							<Select.Root type="single" bind:value={formData.type} disabled={!canWrite}>
								<Select.Trigger id="type" class="bg-background w-full">
									{tradeTypeLabel(formData.type)}
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
							<Input id="subtype" bind:value={formData.subtype} disabled={!canWrite} />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="description" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_description()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Input id="description" bind:value={formData.description} disabled={!canWrite} />
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
								bind:value={formData.quantity}
								disabled={!canWrite}
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
							<CurrencyField
								id="price"
								name="price"
								bind:value={formData.price}
								disabled={!canWrite}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="amount" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_amount()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<CurrencyField
								id="amount"
								name="amount"
								bind:value={formData.amount}
								disabled={!canWrite}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="fees" class="justify-start pr-0 md:justify-end">
									{m.trades_label_fees()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<CurrencyField
								id="fees"
								name="fees"
								bind:value={formData.fees}
								disabled={!canWrite}
							/>
						</FormFieldRow>
					</Fieldset>

					<Fieldset>
						<FormFieldRow itemsAlignment="items-start">
							<div
								class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2"
							>
								<Label for="notes" class="justify-start pr-0 md:justify-end">
									{m.transactions_label_notes()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Textarea
								id="notes"
								bind:value={formData.notes}
								disabled={!canWrite}
								class="bg-background"
							/>
						</FormFieldRow>
					</Fieldset>

					{#if canWrite}
						<footer class="border-border bg-border border-t p-2">
							<div class="flex justify-end">
								<Button type="submit">{m.transactions_button_save()}</Button>
							</div>
						</footer>
					{/if}
				</form>
			</div>
		{/if}
	</Section>

	{#if canWrite || isLoading}
		<Section>
			<SectionTitle title={m.danger_zone_title()} />
			{#if isLoading || !trade}
				<Skeleton class="h-24" />
			{:else}
				<div
					class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
				>
					<div class="flex items-center justify-between p-4">
						<div>
							<p class="text-sm">{m.trades_delete_description()}</p>
							<p class="text-destructive text-sm">{m.transactions_delete_subtext()}</p>
						</div>
						<AlertDialog.Root>
							<AlertDialog.Trigger>
								<Button variant="destructive">{m.transactions_delete_button()}</Button>
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>{m.transactions_delete_confirm_title()}</AlertDialog.Title>
									<AlertDialog.Description>
										{m.trades_delete_confirm_description()}
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>{m.transactions_delete_confirm_cancel()}</AlertDialog.Cancel>
									<AlertDialog.Action onclick={handleDelete}>
										{m.transactions_delete_confirm_continue()}
									</AlertDialog.Action>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</div>
			{/if}
		</Section>
	{/if}
</Page>
