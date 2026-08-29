<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import AccountPicker from '$lib/components/account-picker.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import SharedRecordReadonlyBanner from '$lib/components/shared-record-readonly-banner.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import type { TransactionsResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { sanitizeFromParam } from '$lib/utils';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();

	const transactionId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed));
	const editableAccounts = $derived(openAccounts.filter((a) => a.canWrite));

	let transaction = $state<TransactionsResponse | null>(null);
	let isLoading = $state(true);

	let formData = $state({
		description: '',
		amount: '',
		date: '',
		accountId: '',
		labelsInput: '',
		notes: '',
		excluded: false
	});

	const selectedAccount = $derived(openAccounts.find((a) => a.id === formData.accountId));
	const canWrite = $derived(
		Boolean(transaction?.owner && ownerId && transaction.owner === ownerId)
	);
	const crumbs = $derived([
		{ label: m.sidebar_transactions(), href: resolve('/transactions') },
		...(selectedAccount
			? [{ label: selectedAccount.name, href: resolve(`/accounts/${selectedAccount.id}`) }]
			: []),
		{ label: m.transactions_edit_page_title() }
	]);

	$effect(() => {
		if (transactionId && ownerId) {
			loadTransaction();
		}
	});

	async function loadTransaction() {
		if (!transactionId || !ownerId) return;
		try {
			isLoading = true;
			const result = await pb.authedClient
				.collection('transactions')
				.getOne<TransactionsResponse>(transactionId, {
					expand: 'labels'
				});
			transaction = result;

			const dateObj = new Date(result.date);
			const year = dateObj.getUTCFullYear();
			const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
			const day = String(dateObj.getUTCDate()).padStart(2, '0');
			const localDate = `${year}-${month}-${day}`;

			const expandedLabels = (result.expand as Record<string, unknown> | undefined)?.labels ?? [];
			const labelNames = (expandedLabels as Array<{ name: string }>).map((l) => l.name).join(', ');

			formData = {
				description: result.description ?? '',
				amount: result.value?.toString() ?? '',
				date: localDate,
				accountId: result.account,
				labelsInput: labelNames,
				notes: result.notes ?? '',
				excluded: Boolean(result.excluded)
			};
		} catch (error) {
			logError('transactionDetail', 'load', error);
			toast.error(m.transactions_edit_error_loading());
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit() {
		const currentTransactionId = transactionId;
		const currentOwnerId = ownerId;
		if (!currentTransactionId || !currentOwnerId || !formData.accountId || !canWrite) return;

		try {
			const labelIds: string[] = [];

			if (formData.labelsInput.trim()) {
				const labelNames = formData.labelsInput
					.split(',')
					.map((l) => l.trim())
					.filter(Boolean);

				for (const labelName of labelNames) {
					const labelId = await pb.findOrCreateLabel(labelName, currentOwnerId);
					labelIds.push(labelId);
				}
			}

			const transactionData: Record<string, unknown> = {
				account: formData.accountId,
				date: new Date(formData.date + 'T12:00:00Z').toISOString(),
				description: formData.description.trim() || undefined,
				value: formData.amount ? parseFloat(formData.amount) : undefined,
				labels: labelIds.length > 0 ? labelIds : undefined,
				notes: formData.notes.trim() || undefined,
				excluded: formData.excluded ? new Date().toISOString() : null
			};

			await pb.authedClient
				.collection('transactions')
				.update(currentTransactionId, transactionData);

			transaction = {
				...transaction!,
				description: formData.description.trim(),
				notes: formData.notes.trim()
			};
			toast.success(m.transactions_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('transactionDetail', 'update', error);
			toast.error(m.transactions_edit_failed());
		}
	}

	async function handleDelete() {
		const currentTransactionId = transactionId;
		if (!currentTransactionId || !canWrite) return;

		try {
			await pb.authedClient.collection('transactions').delete(currentTransactionId);
			toast.success(m.transactions_delete_success());
			goto(resolve('/transactions'));
		} catch (error) {
			logError('transactionDetail', 'delete', error);
			toast.error(m.transactions_delete_failed());
		}
	}
</script>

<Page pageTitle={m.transactions_edit_page_title()} {crumbs}>
	{#if !isLoading && transaction && !canWrite}
		<Section>
			<SharedRecordReadonlyBanner title={m.transactions_readonly_title()} />
		</Section>
	{/if}
	<Section>
		<SectionTitle title={m.transactions_section_details()} />
		{#if isLoading || !transaction}
			<Skeleton class="h-96" />
		{:else}
			<div class="border-border overflow-hidden rounded border">
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleSubmit();
					}}
					class="space-y-0"
				>
					<Fieldset isFirst={true}>
						<FormFieldRow>
							<Label for="account" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_account()}</Label
							>
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
							<Label for="description" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_description()}</Label
							>
							<Input id="description" bind:value={formData.description} disabled={!canWrite} />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="amount" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_amount()}</Label
							>
							<CurrencyField
								id="amount"
								name="amount"
								bind:value={formData.amount}
								currency={selectedAccount?.currency}
								required
								disabled={!canWrite}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="date" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_date()}</Label
							>
							<Input
								id="date"
								type="date"
								bind:value={formData.date}
								required
								disabled={!canWrite}
							/>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="labels" class="justify-start pr-0 md:justify-end"
									>{m.transactions_label_labels()}</Label
								>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<Input
								id="labels"
								bind:value={formData.labelsInput}
								disabled={!canWrite}
								placeholder={m.transactions_labels_placeholder()}
							/>
						</FormFieldRow>

						<FormFieldRow itemsAlignment="items-start">
							<div
								class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2"
							>
								<Label for="notes" class="justify-start pr-0 md:justify-end"
									>{m.transactions_label_notes()}</Label
								>
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

					<Fieldset>
						<FormFieldRow>
							<Label class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_mark_as()}</Label
							>
							<CheckboxLabel
								id="excluded"
								bind:checked={formData.excluded}
								disabled={!canWrite}
								label={m.transactions_label_excluded_from_totals()}
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
			{#if isLoading || !transaction}
				<Skeleton class="h-24" />
			{:else}
				<div
					class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
				>
					<div class="flex items-center justify-between p-4">
						<div>
							<p class="text-sm">{m.transactions_delete_description()}</p>
							<p class="text-destructive text-sm">{m.transactions_delete_subtext()}</p>
						</div>
						<AlertDialog.Root>
							<AlertDialog.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="destructive">{m.transactions_delete_button()}</Button>
								{/snippet}
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>{m.transactions_delete_confirm_title()}</AlertDialog.Title>
									<AlertDialog.Description>
										{m.transactions_delete_confirm_description()}
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>{m.transactions_delete_confirm_cancel()}</AlertDialog.Cancel>
									<AlertDialog.Action onclick={handleDelete}
										>{m.transactions_delete_confirm_continue()}</AlertDialog.Action
									>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</div>
			{/if}
		</Section>
	{/if}
</Page>
