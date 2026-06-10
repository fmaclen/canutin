<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const openAccounts = $derived(accountsContext.accounts.filter((a) => !a.closed && a.canWrite));

	let description = $state('');
	let amount = $state('');
	let date = $state('');
	let accountId = $state('');
	let labelsInput = $state('');
	let notes = $state('');
	let excluded = $state(false);

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;
		if (!accountId) {
			toast.error(m.account_required());
			return;
		}

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
				notes: notes.trim() || undefined,
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
					<Breadcrumb.Link href={resolve('/transactions')}
						>{m.sidebar_transactions()}</Breadcrumb.Link
					>
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
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="date" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_date()}
						</Label>
						<Input id="date" type="date" bind:value={date} required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="description" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_description()}
						</Label>
						<Input id="description" bind:value={description} />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="amount" class="justify-start pr-0 md:justify-end">
							{m.transactions_label_amount()}
						</Label>
						<CurrencyField id="amount" name="amount" bind:value={amount} required />
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="labels" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_labels()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<Input
							id="labels"
							bind:value={labelsInput}
							placeholder={m.transactions_labels_placeholder()}
						/>
					</FormFieldRow>

					<FormFieldRow itemsAlignment="items-start">
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1 md:pt-2">
							<Label for="notes" class="justify-start pr-0 md:justify-end">
								{m.transactions_label_notes()}
							</Label>
							<span class="text-muted-foreground text-sm">{m.transactions_text_optional()}</span>
						</div>
						<Textarea id="notes" bind:value={notes} class="bg-background" />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label class="justify-start pr-0 md:justify-end">
							{m.transactions_label_mark_as()}
						</Label>
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
