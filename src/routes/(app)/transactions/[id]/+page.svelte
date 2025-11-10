<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { SvelteMap } from 'svelte/reactivity';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions, type TransactionsResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();

	const transactionId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed));

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
			color: 'bg-other'
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

	const selectedAccount = $derived(openAccounts.find((a) => a.id === formData.accountId));

	let transaction = $state<TransactionsResponse | null>(null);
	let isLoading = $state(true);

	let formData = $state({
		description: '',
		amount: '',
		date: '',
		accountId: '',
		labelsInput: '',
		excluded: false
	});

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
					filter: `owner='${ownerId}'`,
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
				excluded: Boolean(result.excluded)
			};
		} catch (error) {
			console.error('Failed to load transaction:', error);
			toast.error(m.transactions_edit_error_loading());
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit() {
		const currentTransactionId = transactionId;
		const currentOwnerId = ownerId;
		if (!currentTransactionId || !currentOwnerId || !formData.accountId) return;

		try {
			const labelIds: string[] = [];

			if (formData.labelsInput.trim()) {
				const labelNames = formData.labelsInput
					.split(',')
					.map((l) => l.trim())
					.filter(Boolean);

				for (const labelName of labelNames) {
					const label = await pb.authedClient.collection('transactionLabels').create({
						name: labelName,
						owner: currentOwnerId
					});
					labelIds.push(label.id);
				}
			}

			const transactionData: Record<string, unknown> = {
				account: formData.accountId,
				date: new Date(formData.date + 'T12:00:00Z').toISOString(),
				description: formData.description.trim() || undefined,
				value: formData.amount ? parseFloat(formData.amount) : undefined,
				labels: labelIds.length > 0 ? labelIds : undefined,
				excluded: formData.excluded ? new Date().toISOString() : null
			};

			await pb.authedClient
				.collection('transactions')
				.update(currentTransactionId, transactionData);

			toast.success(m.transactions_edit_success());
		} catch (error) {
			console.error('Failed to update transaction:', error);
			toast.error(m.transactions_edit_failed());
		}
	}

	async function handleDelete() {
		const currentTransactionId = transactionId;
		if (!currentTransactionId) return;

		try {
			await pb.authedClient.collection('transactions').delete(currentTransactionId);
			toast.success(m.transactions_delete_success());
			goto(resolve('/transactions'));
		} catch (error) {
			console.error('Failed to delete transaction:', error);
			toast.error(m.transactions_delete_failed());
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
					<Breadcrumb.Link href="/transactions">{m.sidebar_transactions()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if isLoading || !transaction}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page
							>{transaction.description || m.transactions_breadcrumb_fallback()}</Breadcrumb.Page
						>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.transactions_edit_page_title()}>
	<Section>
		<SectionTitle title={m.transactions_section_details()} />
		{#if isLoading || !transaction}
			<Skeleton class="h-96" />
		{:else}
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
							<Label for="description" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_description()}</Label
							>
							<Input id="description" bind:value={formData.description} />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="amount" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_amount()}</Label
							>
							<Input id="amount" type="number" step="0.01" bind:value={formData.amount} required />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="date" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_date()}</Label
							>
							<Input id="date" type="date" bind:value={formData.date} required />
						</FormFieldRow>

						<FormFieldRow>
							<Label for="account" class="justify-start pr-0 md:justify-end"
								>{m.transactions_label_account()}</Label
							>
							<Select.Root type="single" bind:value={formData.accountId}>
								<Select.Trigger id="account" class="bg-background w-full">
									{#if selectedAccount}
										<div class="flex items-center gap-2">
											<div
												class="size-2 rounded-full {groupMeta[
													selectedAccount.balanceGroup as AccountsBalanceGroupOptions
												].color}"
											></div>
											{selectedAccount.name}
										</div>
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
								placeholder={m.transactions_labels_placeholder()}
							/>
						</FormFieldRow>
					</Fieldset>

					<Fieldset>
						<FormFieldRow itemsAlignment="items-start">
							<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
								>{m.transactions_label_mark_as()}</Label
							>
							<div class="space-y-2">
								<Label
									for="excluded"
									class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
								>
									<Checkbox id="excluded" bind:checked={formData.excluded} class="bg-background" />
									<span>{m.transactions_label_excluded_from_totals()}</span>
								</Label>
							</div>
						</FormFieldRow>
					</Fieldset>

					<footer class="border-border bg-border border-t p-2">
						<div class="flex justify-end">
							<Button type="submit">{m.transactions_button_save()}</Button>
						</div>
					</footer>
				</form>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.danger_zone_title()} />
		{#if isLoading || !transaction}
			<Skeleton class="h-24" />
		{:else}
			<div
				class="bg-muted border-border overflow-hidden rounded-md border md:grayscale md:hover:grayscale-0"
			>
				<div class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm">{m.transactions_delete_description()}</p>
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
</Page>
