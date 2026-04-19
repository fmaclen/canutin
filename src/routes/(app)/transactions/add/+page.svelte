<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		BALANCE_GROUP_ORDER,
		getBalanceGroupMeta,
		groupAccountsByBalanceGroup
	} from '$lib/account-utils';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
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

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed && a.canWrite));

	const groupMeta = getBalanceGroupMeta();
	const accountsByGroup = $derived(groupAccountsByBalanceGroup(openAccounts));

	const selectedAccount = $derived(openAccounts.find((a) => a.id === accountId));

	let description = $state('');
	let amount = $state('');
	let date = $state('');
	let accountId = $state('');
	let labelsInput = $state('');
	let excluded = $state(false);

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || !accountId) return;

		try {
			const labelIds: string[] = [];

			if (labelsInput.trim()) {
				const labelNames = labelsInput
					.split(',')
					.map((l) => l.trim())
					.filter(Boolean);

				for (const labelName of labelNames) {
					const labelId = await pb.findOrCreateLabel(labelName, currentOwnerId);
					labelIds.push(labelId);
				}
			}

			const transactionData: Record<string, unknown> = {
				account: accountId,
				owner: currentOwnerId,
				date: new Date(date + 'T12:00:00Z').toISOString(),
				description: description.trim() || undefined,
				value: amount ? parseFloat(amount) : undefined,
				labels: labelIds.length > 0 ? labelIds : undefined,
				excluded: excluded ? new Date().toISOString() : undefined
			};

			await pb.authedClient.collection('transactions').create(transactionData);

			toast.success(m.transactions_add_success());
			await goto(resolve('/transactions'));
		} catch (error) {
			console.error('Failed to create transaction:', error);
			toast.error(m.transactions_add_failed());
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
					<Breadcrumb.Page>{m.transactions_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.transactions_add_page_title()}>
	<Section>
		<SectionTitle title={m.transactions_section_details()} />
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
						<Label for="description" class="justify-start pr-0 md:justify-end"
							>{m.transactions_label_description()}</Label
						>
						<Input id="description" bind:value={description} />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="amount" class="justify-start pr-0 md:justify-end"
							>{m.transactions_label_amount()}</Label
						>
						<CurrencyField id="amount" name="amount" bind:value={amount} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="date" class="justify-start pr-0 md:justify-end"
							>{m.transactions_label_date()}</Label
						>
						<Input id="date" type="date" bind:value={date} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="account" class="justify-start pr-0 md:justify-end"
							>{m.transactions_label_account()}</Label
						>
						<Select.Root type="single" bind:value={accountId}>
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
								{:else}
									<span class="text-muted-foreground"
										>{m.transactions_account_select_placeholder()}</span
									>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#each BALANCE_GROUP_ORDER as group (group)}
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
							bind:value={labelsInput}
							placeholder={m.transactions_labels_placeholder()}
						/>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label class="justify-start pr-0 md:justify-end">{m.transactions_label_mark_as()}</Label
						>
						<CheckboxLabel
							id="excluded"
							bind:checked={excluded}
							label={m.transactions_label_excluded_from_totals()}
						/>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.transactions_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
