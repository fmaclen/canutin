<script lang="ts">
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';

	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import { linkSession, type PlaidAccount } from '../link-session.svelte';

	// Sentinel for the "Create new account" option; PocketBase ids are 15 characters so it can
	// never collide with a real account id.
	const CREATE_NEW = 'create';

	function titleCaseSubtype(account: PlaidAccount) {
		return (account.subtype || account.type).replace(/\b\w/g, (letter) => letter.toUpperCase());
	}

	function balanceGroupFor(account: PlaidAccount) {
		switch (account.type) {
			case 'depository':
				return AccountsBalanceGroupOptions.CASH;
			case 'credit':
			case 'loan':
				return AccountsBalanceGroupOptions.DEBT;
			case 'investment':
				return AccountsBalanceGroupOptions.INVESTMENT;
			default:
				return AccountsBalanceGroupOptions.OTHER;
		}
	}

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();

	// Read once: the handshake route filled this in before navigating here, and it is emptied again
	// when this page tears down.
	const connectionId = linkSession.connectionId;
	const institutionName = linkSession.institutionName;
	const plaidAccounts = linkSession.accounts;

	const ownerId = $derived(auth.currentUser?.record?.id);
	let matches: Record<string, string> = $state(
		Object.fromEntries(plaidAccounts.map((account) => [account.plaidAccountId, CREATE_NEW]))
	);
	let isSaving = $state(false);
	let submissionSucceeded = $state(false);
	// Tracked across retries so a second submit doesn't re-create accounts that already went through.
	const completedPlaidAccountIds = new SvelteSet<string>();
	let formError = $state('');
	let discardConfirmOpen = $state(false);
	let connectionDiscarded = $state(false);
	let pendingNavigationUrl: URL | null = $state(null);

	$effect(() => {
		if (!connectionId) void goto(resolve('/accounts'), { replaceState: true });
	});

	onDestroy(() => {
		// Safety net for teardowns that bypass the discard dialog (tab close, hard reload).
		if (connectionId && !submissionSucceeded && !isSaving && !connectionDiscarded) {
			void pb.authedClient
				.send(`/api/canutin/plaid/connections/${connectionId}`, { method: 'DELETE' })
				.catch(() => {});
		}
		linkSession.connectionId = '';
		linkSession.institutionName = '';
		linkSession.accounts = [];
	});

	// An exchanged connection with no accounts yet is server-side garbage if the user walks away, so
	// every in-app route change is turned into an explicit discard decision.
	beforeNavigate((navigation) => {
		if (navigation.type === 'leave') return;
		if (!navigation.to) return;
		if (!connectionId || submissionSucceeded || isSaving || connectionDiscarded) return;
		navigation.cancel();
		pendingNavigationUrl = navigation.to.url;
		discardConfirmOpen = true;
	});

	async function handleDiscard() {
		const destination = pendingNavigationUrl;
		connectionDiscarded = true;
		if (connectionId) {
			await pb.authedClient
				.send(`/api/canutin/plaid/connections/${connectionId}`, { method: 'DELETE' })
				.catch(() => {});
		}
		if (destination) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- URL captured from the navigation we intercepted
			await goto(destination);
			return;
		}
		await goto(resolve('/accounts'));
	}

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;
		formError = '';
		const existingAccountIds = plaidAccounts
			.map((account) => matches[account.plaidAccountId])
			.filter((accountId) => accountId !== CREATE_NEW);
		if (new Set(existingAccountIds).size !== existingAccountIds.length) {
			formError = m.accounts_link_existing_duplicate();
			return;
		}

		isSaving = true;
		const loadingToast = toast.loading(m.accounts_link_confirming());
		try {
			for (const account of plaidAccounts) {
				if (completedPlaidAccountIds.has(account.plaidAccountId)) continue;
				const matchedAccountId = matches[account.plaidAccountId];
				if (matchedAccountId !== CREATE_NEW) {
					await pb.authedClient.collection('accounts').update(matchedAccountId, {
						externalId: account.plaidAccountId,
						externalMask: account.mask || undefined,
						connection: connectionId
					});
					completedPlaidAccountIds.add(account.plaidAccountId);
					continue;
				}

				const balanceType = await balanceTypesContext.getOrCreate(
					titleCaseSubtype(account),
					currentOwnerId
				);
				await pb.authedClient.collection('accounts').create({
					name: account.name,
					institution: institutionName || undefined,
					balanceGroup: balanceGroupFor(account),
					balanceType,
					currency: account.currency || interfacePreferences.displayCurrency,
					owner: currentOwnerId,
					externalId: account.plaidAccountId,
					externalMask: account.mask || undefined,
					connection: connectionId
				});
				completedPlaidAccountIds.add(account.plaidAccountId);
			}

			submissionSucceeded = true;
			await accountsContext.refreshForCurrentUser();
			void pb.authedClient
				.send(`/api/canutin/plaid/connections/${connectionId}/sync`, { method: 'POST' })
				.catch((error) => {
					logError('plaidLink', 'sync', error);
					toast.error(m.accounts_link_sync_failed());
				});
			toast.success(m.accounts_link_success());
			await goto(resolve('/accounts'));
		} catch (error) {
			logError('plaidLink', 'save_matches', error);
			toast.error(m.accounts_link_save_failed());
			isSaving = false;
		} finally {
			toast.dismiss(loadingToast);
		}
	}
</script>

{#if connectionId}
	<Page
		pageTitle={m.accounts_link_page_title()}
		crumbs={[
			{ label: m.sidebar_accounts(), href: resolve('/accounts') },
			{ label: m.accounts_add_page_title(), href: resolve('/accounts/add') },
			{ label: m.accounts_link_page_title() }
		]}
	>
		<Section>
			<SectionTitle title={m.accounts_link_match_section_title()} />
			{#if plaidAccounts.length === 0}
				<Empty>{m.accounts_link_empty()}</Empty>
			{:else}
				<div class="border-border overflow-hidden rounded border">
					<form
						onsubmit={(event) => {
							event.preventDefault();
							handleSubmit();
						}}
						class="space-y-0"
					>
						<Fieldset isFirst={true}>
							<FormFieldRow>
								<Label for="institution" class="justify-start pr-0 md:justify-end"
									>{m.accounts_label_institution()}</Label
								>
								<Input id="institution" value={institutionName} disabled />
							</FormFieldRow>
						</Fieldset>

						{#each plaidAccounts as account (account.plaidAccountId)}
							{@const currency = account.currency || interfacePreferences.displayCurrency}
							{@const chosenElsewhere = new Set(
								plaidAccounts
									.filter((other) => other.plaidAccountId !== account.plaidAccountId)
									.map((other) => matches[other.plaidAccountId])
							)}
							{@const eligibleAccounts = accountsContext.accounts.filter(
								(existing) =>
									existing.isOwner &&
									!existing.connection &&
									!existing.closed &&
									existing.currency === currency &&
									!chosenElsewhere.has(existing.id)
							)}
							<Fieldset>
								<FormFieldRow>
									<Label
										for={`name-${account.plaidAccountId}`}
										class="justify-start pr-0 md:justify-end"
										>{m.accounts_link_label_account()}</Label
									>
									<Input
										id={`name-${account.plaidAccountId}`}
										value={account.mask ? `${account.mask} · ${account.name}` : account.name}
										disabled
									/>
								</FormFieldRow>

								<FormFieldRow>
									<Label
										for={`type-${account.plaidAccountId}`}
										class="justify-start pr-0 md:justify-end">{m.accounts_link_label_type()}</Label
									>
									<Input
										id={`type-${account.plaidAccountId}`}
										value={titleCaseSubtype(account)}
										disabled
									/>
								</FormFieldRow>

								<FormFieldRow>
									<Label
										for={`balance-${account.plaidAccountId}`}
										class="justify-start pr-0 md:justify-end">{m.accounts_label_balance()}</Label
									>
									<CurrencyField
										id={`balance-${account.plaidAccountId}`}
										value={String(account.balance)}
										{currency}
										disabled
									/>
								</FormFieldRow>

								<FormFieldRow>
									<Label
										for={`match-${account.plaidAccountId}`}
										class="justify-start pr-0 md:justify-end"
										>{m.accounts_link_label_link_to()}</Label
									>
									<Select.Root
										type="single"
										value={matches[account.plaidAccountId]}
										onValueChange={(value) => {
											matches[account.plaidAccountId] = value;
											formError = '';
										}}
										disabled={isSaving}
									>
										<Select.Trigger
											id={`match-${account.plaidAccountId}`}
											class="bg-background w-full"
										>
											{matches[account.plaidAccountId] === CREATE_NEW
												? m.accounts_link_create_new()
												: eligibleAccounts.find(
														(existing) => existing.id === matches[account.plaidAccountId]
													)?.name}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value={CREATE_NEW}>{m.accounts_link_create_new()}</Select.Item>
											{#each eligibleAccounts as existing (existing.id)}
												<Select.Item value={existing.id}>{existing.name}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</FormFieldRow>
							</Fieldset>
						{/each}

						<footer class="border-border bg-border border-t p-2">
							<div class="flex items-center justify-end gap-2">
								{#if formError}
									<p class="text-destructive mr-auto text-sm" role="alert">{formError}</p>
								{/if}
								<Button
									variant="secondary"
									type="button"
									disabled={isSaving}
									onclick={() => {
										pendingNavigationUrl = null;
										discardConfirmOpen = true;
									}}
								>
									{m.accounts_link_cancel()}
								</Button>
								<Button type="submit" disabled={isSaving}>
									{m.accounts_link_confirm()}
								</Button>
							</div>
						</footer>
					</form>
				</div>
			{/if}
		</Section>
	</Page>
{/if}

<AlertDialog.Root bind:open={discardConfirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.accounts_link_discard_confirm_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.accounts_link_discard_confirm_description()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (pendingNavigationUrl = null)}>
				{m.accounts_link_discard_confirm_cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDiscard}>
				{m.accounts_link_discard_confirm_continue()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
