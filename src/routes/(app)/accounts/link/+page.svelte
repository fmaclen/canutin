<script lang="ts">
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import CurrencyField from '$lib/components/currency-field.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { interfacePreferences } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions, type AccountsResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	type PlaidAccount = {
		plaidAccountId: string;
		name: string;
		mask: string;
		type: string;
		subtype: string;
		currency: string;
		balance: number;
	};

	type PlaidHandler = {
		open: () => void;
		destroy: () => void;
	};

	type PlaidFactory = {
		create: (options: {
			token: string;
			onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
			onExit: () => void;
		}) => PlaidHandler;
	};

	function hasPlaidFactory(value: Window): value is Window & { Plaid: PlaidFactory } {
		return (
			'Plaid' in value &&
			typeof value.Plaid === 'object' &&
			value.Plaid !== null &&
			'create' in value.Plaid &&
			typeof value.Plaid.create === 'function'
		);
	}

	// Sentinel for the "Create new account" option; PocketBase ids are 15 characters so it can
	// never collide with a real account id.
	const CREATE_NEW = 'create';

	function titleCaseSubtype(account: PlaidAccount) {
		return (account.subtype || account.type).replace(/\b\w/g, (letter) => letter.toUpperCase());
	}

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	let plaidAccounts: PlaidAccount[] = $state([]);
	let matches: Record<string, string> = $state({});
	let connectionId = $state('');
	let institutionName = $state('');
	let notConfigured = $state(false);
	let exchangeLoaded = $state(false);
	let isSaving = $state(false);
	let submissionSucceeded = $state(false);
	let connectionAccountsLoaded = $state(false);
	let completedPlaidAccountIds: string[] = $state([]);
	let formError = $state('');
	let discardConfirmOpen = $state(false);
	let connectionDiscarded = $state(false);
	let pendingNavigationUrl: URL | null = $state(null);

	$effect(() => {
		let cancelled = false;
		let succeeded = false;
		let handler: PlaidHandler | undefined;

		void (async () => {
			try {
				const { linkToken } = await pb.authedClient.send<{ linkToken: string }>(
					'/api/canutin/plaid/link-token',
					{ method: 'POST' }
				);
				if (cancelled) return;

				if (!hasPlaidFactory(window)) {
					await new Promise<void>((resolveScript, rejectScript) => {
						const existing = document.querySelector<HTMLScriptElement>('script[data-plaid-link]');
						const script = existing ?? document.createElement('script');
						script.addEventListener('load', () => resolveScript(), { once: true });
						script.addEventListener(
							'error',
							() => {
								script.remove();
								rejectScript(new Error('Plaid Link script failed to load'));
							},
							{ once: true }
						);
						if (!existing) {
							script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
							script.dataset.plaidLink = '';
							document.head.append(script);
						}
					});
				}
				if (cancelled || !hasPlaidFactory(window)) return;

				const createdHandler = window.Plaid.create({
					token: linkToken,
					onSuccess: (publicToken, metadata) => {
						succeeded = true;
						handler?.destroy();
						institutionName = metadata.institution?.name ?? '';
						void (async () => {
							try {
								const response = await pb.authedClient.send<{
									connectionId: string;
									accounts: PlaidAccount[];
								}>('/api/canutin/plaid/exchange', {
									method: 'POST',
									body: { publicToken, institutionName }
								});
								if (cancelled) return;
								connectionId = response.connectionId;
								plaidAccounts = response.accounts;
								matches = Object.fromEntries(
									response.accounts.map((account) => [account.plaidAccountId, CREATE_NEW])
								);
								exchangeLoaded = true;
							} catch (error) {
								if (cancelled) return;
								logError('plaidLink', 'exchange', error);
								toast.error(m.accounts_link_exchange_failed());
								await goto(resolve('/accounts'));
							}
						})();
					},
					onExit: () => {
						if (!succeeded) void goto(resolve('/accounts'));
					}
				});
				handler = createdHandler;
				createdHandler.open();
			} catch (error) {
				if (cancelled) return;
				if (
					error instanceof ClientResponseError &&
					error.status === 503 &&
					error.response?.error === 'plaid_not_configured'
				) {
					notConfigured = true;
					return;
				}
				logError('plaidLink', 'start', error);
				toast.error(m.accounts_link_start_failed());
				await goto(resolve('/accounts'));
			}
		})();

		return () => {
			cancelled = true;
			handler?.destroy();
			// Safety net for teardowns that bypass the discard dialog (tab close, hard reload).
			if (connectionId && !submissionSucceeded && !isSaving && !connectionDiscarded) {
				void pb.authedClient
					.send(`/api/canutin/plaid/connections/${connectionId}`, { method: 'DELETE' })
					.catch(() => {});
			}
		};
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
		try {
			if (!connectionAccountsLoaded) {
				const connectedAccounts = await pb.authedClient
					.collection('accounts')
					.getFullList<AccountsResponse>({
						filter: `owner = '${currentOwnerId}' && connection = '${connectionId}'`
					});
				completedPlaidAccountIds = [
					...new Set([
						...completedPlaidAccountIds,
						...connectedAccounts.flatMap((account) =>
							account.externalId ? [account.externalId] : []
						)
					])
				];
				connectionAccountsLoaded = true;
			}

			for (const account of plaidAccounts) {
				if (completedPlaidAccountIds.includes(account.plaidAccountId)) continue;
				const matchedAccountId = matches[account.plaidAccountId];
				if (matchedAccountId !== CREATE_NEW) {
					await pb.authedClient.collection('accounts').update(matchedAccountId, {
						externalId: account.plaidAccountId,
						connection: connectionId
					});
					completedPlaidAccountIds = [...completedPlaidAccountIds, account.plaidAccountId];
					continue;
				}

				const balanceType = await balanceTypesContext.getOrCreate(
					titleCaseSubtype(account),
					currentOwnerId
				);
				const balanceGroup =
					account.type === 'depository'
						? AccountsBalanceGroupOptions.CASH
						: account.type === 'credit' || account.type === 'loan'
							? AccountsBalanceGroupOptions.DEBT
							: account.type === 'investment'
								? AccountsBalanceGroupOptions.INVESTMENT
								: AccountsBalanceGroupOptions.OTHER;

				await pb.authedClient.collection('accounts').create({
					name: account.name,
					institution: institutionName || undefined,
					balanceGroup,
					balanceType,
					currency: account.currency || interfacePreferences.displayCurrency,
					owner: currentOwnerId,
					externalId: account.plaidAccountId,
					connection: connectionId
				});
				completedPlaidAccountIds = [...completedPlaidAccountIds, account.plaidAccountId];
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
		}
	}
</script>

<Page
	pageTitle={m.accounts_link_page_title()}
	crumbs={[
		{ label: m.sidebar_accounts(), href: resolve('/accounts') },
		{ label: m.accounts_link_page_title() }
	]}
>
	{#if notConfigured}
		<Section>
			<SectionTitle title={m.accounts_link_setup_section_title()} />
			<Empty>
				<div class="space-y-2 text-center">
					<p>{m.accounts_link_not_configured()}</p>
					<p>
						{m.accounts_link_configuration({
							clientId: 'PLAID_CLIENT_ID',
							secret: 'PLAID_SECRET',
							environment: 'PLAID_ENV'
						})}
					</p>
					<Link href="https://plaid.com/docs" target="_blank" rel="noreferrer">
						{m.accounts_link_documentation()}
					</Link>
				</div>
			</Empty>
		</Section>
	{:else if !exchangeLoaded}
		<Section>
			<SectionTitle title={m.accounts_link_connect_section_title()} />
			<Skeleton class="h-64" showSpinner />
		</Section>
	{:else if plaidAccounts.length === 0}
		<Section>
			<SectionTitle title={m.accounts_link_match_section_title()} />
			<Empty>
				<div class="space-y-2 text-center">
					<p>{m.accounts_link_empty()}</p>
					<Link href={resolve('/accounts')}>{m.accounts_link_back()}</Link>
				</div>
			</Empty>
		</Section>
	{:else}
		<Section>
			<SectionTitle title={m.accounts_link_match_section_title()} />
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
									class="justify-start pr-0 md:justify-end">{m.accounts_link_label_account()}</Label
								>
								<Input id={`name-${account.plaidAccountId}`} value={account.name} disabled />
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
									for={`mask-${account.plaidAccountId}`}
									class="justify-start pr-0 md:justify-end"
									>{m.accounts_link_label_account_number()}</Label
								>
								<Input
									id={`mask-${account.plaidAccountId}`}
									value={account.mask || m.accounts_link_no_mask()}
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
									class="justify-start pr-0 md:justify-end">{m.accounts_link_label_link_to()}</Label
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

					{#if formError}
						<div class="border-border border-t p-2">
							<p
								class="border-destructive/30 bg-destructive/5 text-destructive rounded border px-3 py-2 text-sm"
								role="alert"
							>
								{formError}
							</p>
						</div>
					{/if}

					<footer class="border-border bg-border flex items-center justify-end gap-2 border-t p-2">
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
							{isSaving ? m.accounts_link_confirming() : m.accounts_link_confirm()}
						</Button>
					</footer>
				</form>
			</div>
		</Section>
	{/if}
</Page>

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
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={handleDiscard}
			>
				{m.accounts_link_discard_confirm_continue()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
