<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { SvelteMap } from 'svelte/reactivity';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getTransactionsContext, type TransactionRow } from '$lib/transactions.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const txContext = getTransactionsContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed));
	const selectedTransactions = $derived(txContext.selectedTransactions);
	const selectedCount = $derived(txContext.selectedCount);

	const balanceGroupOrder = Object.values(AccountsBalanceGroupOptions);

	const groupMeta = {
		[AccountsBalanceGroupOptions.CASH]: {
			label: m.accounts_group_cash_label(),
			color: 'bg-cash'
		},
		[AccountsBalanceGroupOptions.DEBT]: {
			label: m.accounts_group_debt_label(),
			color: 'bg-debt'
		},
		[AccountsBalanceGroupOptions.INVESTMENT]: {
			label: m.accounts_group_investment_label(),
			color: 'bg-investment'
		},
		[AccountsBalanceGroupOptions.OTHER]: {
			label: m.accounts_group_other_label(),
			color: 'bg-other-assets'
		}
	} satisfies Record<AccountsBalanceGroupOptions, { label: string; color: string }>;

	const accountsByGroup = $derived.by(() => {
		const grouped = new SvelteMap<AccountsBalanceGroupOptions, typeof openAccounts>();
		for (const account of openAccounts) {
			const group = account.balanceGroup as AccountsBalanceGroupOptions;
			if (!grouped.has(group)) {
				grouped.set(group, []);
			}
			grouped.get(group)!.push(account);
		}
		return grouped;
	});

	// Redirect if no selection
	$effect(() => {
		if (selectedCount === 0) {
			goto(resolve('/transactions'));
		}
	});

	// Helper to detect common value across selected transactions
	function getCommonValue<T>(getter: (tx: TransactionRow) => T): T | null {
		if (selectedTransactions.length === 0) return null;
		const first = getter(selectedTransactions[0]);
		const allSame = selectedTransactions.every((tx) => {
			const val = getter(tx);
			if (Array.isArray(first) && Array.isArray(val)) {
				return first.length === val.length && first.every((v, i) => v === val[i]);
			}
			return val === first;
		});
		return allSame ? first : null;
	}

	// Detect common values
	const commonAccountId = $derived(getCommonValue((tx) => tx.accountId));
	const commonDescription = $derived(getCommonValue((tx) => tx.description));
	const commonDate = $derived(getCommonValue((tx) => tx.dateIso.split('T')[0]));
	const commonLabels = $derived(getCommonValue((tx) => tx.labels.join(', ')));
	const commonAmount = $derived(getCommonValue((tx) => tx.value));
	const commonExcluded = $derived(getCommonValue((tx) => tx.excluded));

	const selectedAccount = $derived(openAccounts.find((a) => a.id === formData.accountId));

	// Form state - edit flags
	let editAccount = $state(false);
	let editDescription = $state(false);
	let editDate = $state(false);
	let editLabels = $state(false);
	let editAmount = $state(false);
	let editExcluded = $state(false);
	let excludedTouched = $state(false);
	let isSubmitting = $state(false);

	// Form state - values
	let formData = $state({
		accountId: '',
		description: '',
		date: '',
		labelsInput: '',
		amount: '',
		excluded: false
	});

	// Initialize form data from common values (only once to avoid overwriting user edits)
	let formInitialized = false;
	$effect(() => {
		if (formInitialized) return;
		if (selectedTransactions.length === 0) return;

		formData.accountId = commonAccountId ?? '';
		formData.description = commonDescription ?? '';
		formData.date = commonDate ?? '';
		formData.labelsInput = commonLabels ?? '';
		formData.amount = commonAmount !== null ? commonAmount.toString() : '';
		formData.excluded = commonExcluded ?? false;
		formInitialized = true;
	});

	const hasAnyEditEnabled = $derived(
		editAccount || editDescription || editDate || editLabels || editAmount || editExcluded
	);

	async function handleApply() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || isSubmitting) return;

		isSubmitting = true;
		const loadingToast = toast.loading(m.transactions_batch_updating());

		try {
			for (const tx of selectedTransactions) {
				const updates: Record<string, unknown> = {};

				if (editAccount && formData.accountId) {
					updates.account = formData.accountId;
				}

				if (editDescription) {
					updates.description = formData.description.trim() || undefined;
				}

				if (editDate && formData.date) {
					updates.date = new Date(formData.date + 'T12:00:00Z').toISOString();
				}

				if (editLabels) {
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
					updates.labels = labelIds.length > 0 ? labelIds : [];
				}

				if (editAmount && formData.amount) {
					updates.value = parseFloat(formData.amount);
				}

				if (editExcluded) {
					updates.excluded = formData.excluded ? new Date().toISOString() : null;
				}

				if (Object.keys(updates).length > 0) {
					await pb.authedClient.collection('transactions').update(tx.id, updates);
				}
			}

			const count = selectedCount;
			txContext.clearSelection();
			toast.dismiss(loadingToast);

			if (count === 1) {
				toast.success(m.transactions_batch_update_success_one());
			} else {
				toast.success(m.transactions_batch_update_success_other({ count }));
			}

			goto(resolve('/transactions'));
		} catch (error) {
			console.error('Failed to batch update transactions:', error);
			toast.dismiss(loadingToast);
			toast.error(m.transactions_edit_failed());
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete() {
		if (isSubmitting) return;

		isSubmitting = true;
		const loadingToast = toast.loading(m.transactions_batch_deleting());

		try {
			for (const tx of selectedTransactions) {
				await pb.authedClient.collection('transactions').delete(tx.id);
			}

			const count = selectedCount;
			txContext.clearSelection();
			toast.dismiss(loadingToast);

			if (count === 1) {
				toast.success(m.transactions_batch_delete_success_one());
			} else {
				toast.success(m.transactions_batch_delete_success_other({ count }));
			}

			goto(resolve('/transactions'));
		} catch (error) {
			console.error('Failed to batch delete transactions:', error);
			toast.dismiss(loadingToast);
			toast.error(m.transactions_delete_failed());
		} finally {
			isSubmitting = false;
		}
	}

	function handleDiscard() {
		txContext.clearSelection();
		goto(resolve('/transactions'));
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/transactions">{m.sidebar_transactions()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.transactions_batch_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.transactions_batch_page_title()}>
	{#if selectedCount === 0}
		<Section>
			<p class="text-muted-foreground">{m.transactions_batch_no_selection()}</p>
		</Section>
	{:else}
		<Section>
			<SectionTitle
				title={selectedCount === 1
					? m.transactions_batch_section_title_one()
					: m.transactions_batch_section_title_other({ count: selectedCount })}
			/>
			<div class="bg-muted border-border overflow-hidden rounded border">
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleApply();
					}}
					class="space-y-0"
				>
					<Fieldset isFirst={true}>
						<FormFieldRow>
							<Label for="account" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_account()}</Label
							>
							<div class="flex gap-2">
								<Select.Root type="single" bind:value={formData.accountId} disabled={!editAccount}>
									<Select.Trigger id="account" class="bg-background w-full pl-3">
										{#if selectedAccount}
											<div class="flex items-center gap-2">
												<div
													class="size-2 rounded-full {groupMeta[
														selectedAccount.balanceGroup as AccountsBalanceGroupOptions
													].color}"
												></div>
												{selectedAccount.name}
											</div>
										{:else if commonAccountId === null}
											<span class="text-muted-foreground"
												>{m.transactions_batch_multiple_accounts()}</span
											>
										{:else}
											<span class="text-muted-foreground"
												>{m.transactions_account_select_placeholder()}</span
											>
										{/if}
									</Select.Trigger>
									<Select.Content>
										{#each balanceGroupOrder as group (group)}
											{@const accountsInGroup = accountsByGroup.get(group) ?? []}
											{#if accountsInGroup.length > 0}
												<Select.Group>
													<Select.Label>
														<div class="flex items-center gap-2">
															<div class="size-2 rounded-full {groupMeta[group].color}"></div>
															{groupMeta[group].label}
														</div>
													</Select.Label>
													{#each accountsInGroup as account (account.id)}
														<Select.Item value={account.id}>{account.name}</Select.Item>
													{/each}
												</Select.Group>
											{/if}
										{/each}
									</Select.Content>
								</Select.Root>
								<CheckboxLabel
									bind:checked={editAccount}
									label={m.transactions_batch_edit_label()}
								/>
							</div>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="description" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_description()}</Label
							>
							<div class="flex gap-2">
								<Input
									id="description"
									bind:value={formData.description}
									disabled={!editDescription}
									placeholder={commonDescription === null
										? m.transactions_batch_multiple_descriptions()
										: undefined}
								/>
								<CheckboxLabel
									bind:checked={editDescription}
									label={m.transactions_batch_edit_label()}
								/>
							</div>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="date" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_date()}</Label
							>
							<div class="flex gap-2">
								<Input
									id="date"
									type="date"
									bind:value={formData.date}
									disabled={!editDate}
									placeholder={commonDate === null
										? m.transactions_batch_multiple_dates()
										: undefined}
								/>
								<CheckboxLabel bind:checked={editDate} label={m.transactions_batch_edit_label()} />
							</div>
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="labels" class="justify-start pr-0 md:justify-end"
									>{m.transactions_label_labels()}</Label
								>
								<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
							</div>
							<div class="flex gap-2">
								<Input
									id="labels"
									bind:value={formData.labelsInput}
									disabled={!editLabels}
									placeholder={commonLabels === null
										? m.transactions_batch_multiple_labels()
										: m.transactions_labels_placeholder()}
								/>
								<CheckboxLabel
									bind:checked={editLabels}
									label={m.transactions_batch_edit_label()}
								/>
							</div>
						</FormFieldRow>

						<FormFieldRow>
							<Label for="amount" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_amount()}</Label
							>
							<div class="flex gap-2">
								{#if commonAmount === null && !editAmount}
									<Input
										id="amount"
										value={m.transactions_batch_multiple_amounts()}
										disabled={true}
									/>
								{:else}
									<CurrencyField
										id="amount"
										name="amount"
										bind:value={formData.amount}
										disabled={!editAmount}
									/>
								{/if}
								<CheckboxLabel
									bind:checked={editAmount}
									label={m.transactions_batch_edit_label()}
								/>
							</div>
						</FormFieldRow>
					</Fieldset>

					<Fieldset>
						<FormFieldRow>
							<Label class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_mark_as()}</Label
							>
							<div class="flex gap-2">
								<CheckboxLabel
									id="excluded"
									bind:checked={formData.excluded}
									disabled={!editExcluded}
									indeterminate={commonExcluded === null && !excludedTouched}
									onCheckedChange={() => (excludedTouched = true)}
									label={m.transactions_label_excluded_from_totals()}
									class="grow"
								/>
								<CheckboxLabel
									bind:checked={editExcluded}
									label={m.transactions_batch_edit_label()}
								/>
							</div>
						</FormFieldRow>
					</Fieldset>

					<footer class="border-border bg-border flex items-center justify-end gap-2 border-t p-2">
						<Button
							variant="secondary"
							type="button"
							onclick={handleDiscard}
							disabled={isSubmitting}>{m.transactions_batch_discard()}</Button
						>
						<Button type="submit" disabled={!hasAnyEditEnabled || isSubmitting}
							>{m.transactions_batch_apply()}</Button
						>
					</footer>
				</form>
			</div>
		</Section>

		<Section>
			<SectionTitle title={m.danger_zone_title()} />
			<div
				class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
			>
				<div class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm">
							{selectedCount === 1
								? m.transactions_batch_delete_description_one()
								: m.transactions_batch_delete_description_other({ count: selectedCount })}
						</p>
						<p class="text-destructive text-sm">{m.transactions_delete_subtext()}</p>
					</div>
					<AlertDialog.Root>
						<AlertDialog.Trigger disabled={isSubmitting}>
							<Button variant="destructive" disabled={isSubmitting}
								>{m.transactions_delete_button()}</Button
							>
						</AlertDialog.Trigger>
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.transactions_delete_confirm_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{selectedCount === 1
										? m.transactions_batch_delete_confirm_description_one()
										: m.transactions_batch_delete_confirm_description_other({
												count: selectedCount
											})}
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
		</Section>
	{/if}
</Page>
