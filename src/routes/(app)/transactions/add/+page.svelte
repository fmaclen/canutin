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
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { logError } from '$lib/logger';
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

	const selectedAccount = $derived(openAccounts.find((a) => a.id === accountId));
	const canSubmit = $derived(Boolean(accountId && date && amount));

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || !canSubmit) return;

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
			logError('addTransaction', 'create', error);
			toast.error(m.transactions_add_failed());
		}
	}
</script>

<Page
	pageTitle={m.transactions_add_page_title()}
	crumbs={[
		{ label: m.sidebar_transactions(), href: resolve('/transactions') },
		{ label: m.transactions_add_page_title() }
	]}
>
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
						<CurrencyField
							id="amount"
							name="amount"
							bind:value={amount}
							currency={selectedAccount?.currency}
							required
						/>
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
						<Button type="submit" disabled={!canSubmit}>{m.transactions_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
