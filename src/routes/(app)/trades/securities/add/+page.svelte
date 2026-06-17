<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Combobox, type ComboboxItem } from '$lib/components/ui/combobox';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';

	import BalanceFields from '../balance-fields.svelte';
	import { createSecurityBalanceFormData, toSecurityBalanceInput } from '../balance-form';

	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();
	const newSecurityValue = '__new_security__';

	let securityId = $state('');
	let name = $state('');
	let symbol = $state('');
	let balanceFormData = $state(createSecurityBalanceFormData());
	let isSaving = $state(false);

	const ownerId = $derived(auth.currentUser?.record?.id);
	const eligibleAccounts = $derived(
		accountsContext.accounts.filter((account) => !account.closed && account.canWrite)
	);
	const selectedSecurity = $derived(
		securitiesContext.securities.find((security) => security.id === securityId) ?? null
	);
	const isNewSecurity = $derived(securityId === newSecurityValue);
	const securityItems = $derived<ComboboxItem[]>(
		securitiesContext.securities.map((security) => ({
			value: security.id,
			label: security.name,
			keywords: security.symbol ? [security.symbol] : undefined
		}))
	);

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId || isSaving) return;
		if (!securityId) {
			toast.error(m.securities_security_required());
			return;
		}
		if (!balanceFormData.accountId) {
			toast.error(m.account_required());
			return;
		}
		const securityName = name.trim();
		if (isNewSecurity && !securityName) {
			toast.error(m.securities_name_required());
			return;
		}

		try {
			isSaving = true;
			const balanceInput = toSecurityBalanceInput(balanceFormData, currentOwnerId);
			const security = isNewSecurity
				? await securitiesContext.createSecurityWithBalance(
						{
							name: securityName,
							symbol: symbol.trim() || undefined,
							owner: currentOwnerId
						},
						balanceInput
					)
				: selectedSecurity;
			if (!security) {
				toast.error(m.securities_security_required());
				return;
			}
			if (!isNewSecurity) {
				await securitiesContext.addSecurityBalance(security.id, balanceInput);
			}
			toast.success(m.securities_add_success());
			await goto(resolve('/trades/securities'));
		} catch (error) {
			console.error('[securitiesAdd]', error);
			toast.error(m.securities_add_failed());
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
					<Breadcrumb.Link href={resolve('/trades')}>{m.trades_title()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/trades/securities')}
						>{m.securities_title()}</Breadcrumb.Link
					>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.securities_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.securities_add_page_title()}>
	<Section>
		<SectionTitle title={m.securities_section_details()} />
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
						<Label for="security" class="justify-start pr-0 md:justify-end">
							{m.securities_table_header_security()}
						</Label>
						<Combobox
							type="single"
							bind:value={securityId}
							items={securityItems}
							placeholder={m.securities_select_placeholder()}
							disabled={isSaving}
							id="security"
							ariaLabel={m.securities_table_header_security()}
							triggerClass="bg-background w-full"
						>
							{#snippet triggerContent()}
								{#if isNewSecurity}
									{m.securities_select_new_label()}
								{:else if selectedSecurity}
									{selectedSecurity.name}
								{:else}
									<span class="text-muted-foreground">{m.securities_select_placeholder()}</span>
								{/if}
							{/snippet}
							{#snippet pinned({ close })}
								<Command.Group heading={m.securities_select_group_new()}>
									<Command.Item
										value={newSecurityValue}
										onSelect={() => {
											securityId = newSecurityValue;
											close();
										}}
									>
										{m.securities_select_add_option()}
									</Command.Item>
								</Command.Group>
							{/snippet}
						</Combobox>
					</FormFieldRow>

					{#if isNewSecurity}
						<FormFieldRow>
							<Label for="security-name" class="justify-start pr-0 md:justify-end">
								{m.securities_label_name()}
							</Label>
							<Input id="security-name" bind:value={name} disabled={isSaving} required />
						</FormFieldRow>

						<FormFieldRow>
							<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
								<Label for="security-symbol" class="justify-start pr-0 md:justify-end">
									{m.securities_label_symbol()}
								</Label>
								<span class="text-muted-foreground text-sm">{m.securities_text_optional()}</span>
							</div>
							<Input id="security-symbol" bind:value={symbol} disabled={isSaving} />
						</FormFieldRow>
					{/if}
				</Fieldset>

				<BalanceFields formData={balanceFormData} accounts={eligibleAccounts} disabled={isSaving} />

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={isSaving}>
							{m.securities_button_add()}
						</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
