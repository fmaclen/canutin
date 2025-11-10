<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
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
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const balanceTypesContext = getBalanceTypesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);

	let name = $state('');
	let institution = $state('');
	let balanceGroup: AccountsBalanceGroupOptions | '' = $state('');
	let accountTypeName = $state('');
	let excluded = $state(false);
	let closed = $state(false);
	let value = $state('');

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;

		try {
			const balanceTypeId = await balanceTypesContext.getOrCreate(accountTypeName, currentOwnerId);

			// Create account
			const accountData: Record<string, unknown> = {
				name: name.trim(),
				balanceGroup: balanceGroup as AccountsBalanceGroupOptions,
				balanceType: balanceTypeId,
				owner: currentOwnerId,
				institution: institution.trim() || undefined,
				excluded: excluded ? new Date().toISOString() : undefined,
				closed: closed ? new Date().toISOString() : undefined
			};

			const account = await pb.authedClient.collection('accounts').create(accountData);

			// Create account balance
			const balanceData: Record<string, unknown> = {
				account: account.id,
				owner: currentOwnerId,
				asOf: new Date().toISOString(),
				value: value ? parseFloat(value) : undefined
			};

			await pb.authedClient.collection('accountBalances').create(balanceData);

			toast.success(m.accounts_add_success());
			await goto(resolve('/accounts'));
		} catch (error) {
			console.error('Failed to create account:', error);
			toast.error(m.accounts_add_failed());
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
					<Breadcrumb.Link href="/accounts">{m.sidebar_accounts()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{m.accounts_add_page_title()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.accounts_add_page_title()}>
	<Section>
		<SectionTitle title={m.accounts_section_details()} />
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
						<Label for="name" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_name()}</Label
						>
						<Input id="name" bind:value={name} required />
					</FormFieldRow>

					<FormFieldRow>
						<div class="flex flex-row items-center gap-2 md:flex-col md:items-end md:gap-1">
							<Label for="institution" class="justify-start pr-0 md:justify-end"
								>{m.accounts_label_institution()}</Label
							>
							<span class="text-muted-foreground text-sm">{m.accounts_text_optional()}</span>
						</div>
						<Input id="institution" bind:value={institution} />
					</FormFieldRow>

					<FormFieldRow>
						<Label id="category-label" for="category" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_category()}</Label
						>
						<Input
							id="category"
							name="category"
							bind:value={accountTypeName}
							placeholder={m.accounts_category_placeholder()}
							required
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="balance-group" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_balance_group()}</Label
						>
						<Select.Root type="single" bind:value={balanceGroup}>
							<Select.Trigger id="balance-group" class="bg-background w-full">
								{#if balanceGroup}
									<div class="flex items-center gap-2">
										<div
											class="size-2 rounded-full {balanceGroup === AccountsBalanceGroupOptions.CASH
												? 'bg-cash'
												: balanceGroup === AccountsBalanceGroupOptions.DEBT
													? 'bg-debt'
													: balanceGroup === AccountsBalanceGroupOptions.INVESTMENT
														? 'bg-investment'
														: 'bg-other'}"
										></div>
										{#if balanceGroup === AccountsBalanceGroupOptions.CASH}
											{m.accounts_group_cash_label()}
										{:else if balanceGroup === AccountsBalanceGroupOptions.DEBT}
											{m.accounts_group_debt_label()}
										{:else if balanceGroup === AccountsBalanceGroupOptions.INVESTMENT}
											{m.accounts_group_investment_label()}
										{:else if balanceGroup === AccountsBalanceGroupOptions.OTHER}
											{m.accounts_group_other_label()}
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground"
										>{m.accounts_balance_group_select_placeholder()}</span
									>
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={AccountsBalanceGroupOptions.CASH}>
									<div class="flex items-center gap-2">
										<div class="bg-cash size-2 rounded-full"></div>
										{m.accounts_group_cash_label()}
									</div>
								</Select.Item>
								<Select.Item value={AccountsBalanceGroupOptions.DEBT}>
									<div class="flex items-center gap-2">
										<div class="bg-debt size-2 rounded-full"></div>
										{m.accounts_group_debt_label()}
									</div>
								</Select.Item>
								<Select.Item value={AccountsBalanceGroupOptions.INVESTMENT}>
									<div class="flex items-center gap-2">
										<div class="bg-investment size-2 rounded-full"></div>
										{m.accounts_group_investment_label()}
									</div>
								</Select.Item>
								<Select.Item value={AccountsBalanceGroupOptions.OTHER}>
									<div class="flex items-center gap-2">
										<div class="bg-other size-2 rounded-full"></div>
										{m.accounts_group_other_label()}
									</div>
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow>
						<Label for="value" class="justify-start pr-0 md:justify-end"
							>{m.accounts_label_balance()}</Label
						>
						<Input id="value" type="number" step="0.01" bind:value />
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5"
							>{m.accounts_label_marked_as()}</Label
						>
						<div class="space-y-2">
							<Label
								for="excluded"
								class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
							>
								<Checkbox id="excluded" bind:checked={excluded} class="bg-background" />
								<span>{m.accounts_label_exclude_from_net_worth()}</span>
							</Label>
							<Label
								for="closed"
								class="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 font-normal"
							>
								<Checkbox id="closed" bind:checked={closed} class="bg-background" />
								<span>{m.accounts_label_closed()}</span>
							</Label>
						</div>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.accounts_button_add()}</Button>
					</div>
				</footer>
			</form>
		</div>
	</Section>
</Page>
