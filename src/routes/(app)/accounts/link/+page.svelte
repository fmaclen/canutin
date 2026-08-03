<script lang="ts">
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import { formatCurrency } from '$lib/components/currency';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Link from '$lib/components/link.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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

	type Match = {
		mode: 'create' | 'existing';
		accountId: string;
	};

	function titleCaseSubtype(account: PlaidAccount) {
		return (account.subtype || account.type).replace(/\b\w/g, (letter) => letter.toUpperCase());
	}

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	let plaidAccounts: PlaidAccount[] = $state([]);
	let matches: Record<string, Match> = $state({});
	let connectionId = $state('');
	let institutionName = $state('');
	let notConfigured = $state(false);
	let exchangeLoaded = $state(false);
	let isSaving = $state(false);
	let submissionSucceeded = $state(false);
	let connectionAccountsLoaded = $state(false);
	let completedPlaidAccountIds: string[] = $state([]);
	let formError = $state('');

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
									response.accounts.map((account) => [
										account.plaidAccountId,
										{ mode: 'create', accountId: '' } satisfies Match
									])
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
			if (connectionId && !submissionSucceeded && !isSaving) {
				void pb.authedClient
					.send(`/api/canutin/plaid/connections/${connectionId}`, { method: 'DELETE' })
					.catch(() => {});
			}
		};
	});

	async function handleSubmit() {
		const currentOwnerId = ownerId;
		if (!currentOwnerId) return;
		formError = '';
		if (
			plaidAccounts.some(
				(account) =>
					matches[account.plaidAccountId].mode === 'existing' &&
					!matches[account.plaidAccountId].accountId
			)
		) {
			toast.error(m.accounts_link_existing_required());
			return;
		}
		const existingAccountIds = plaidAccounts
			.filter((account) => matches[account.plaidAccountId].mode === 'existing')
			.map((account) => matches[account.plaidAccountId].accountId);
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
				const match = matches[account.plaidAccountId];
				if (match.mode === 'existing') {
					await pb.authedClient.collection('accounts').update(match.accountId, {
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
						{#each plaidAccounts as account (account.plaidAccountId)}
							{@const currency = account.currency || interfacePreferences.displayCurrency}
							{@const chosenElsewhere = new Set(
								plaidAccounts
									.filter((other) => other.plaidAccountId !== account.plaidAccountId)
									.map((other) => matches[other.plaidAccountId].accountId)
							)}
							{@const eligibleAccounts = accountsContext.accounts.filter(
								(existing) =>
									existing.isOwner &&
									!existing.connection &&
									!existing.closed &&
									existing.currency === currency &&
									!chosenElsewhere.has(existing.id)
							)}
							<FormFieldRow itemsAlignment="items-start">
								<Label
									for={`match-${account.plaidAccountId}`}
									class="flex flex-col items-start justify-start gap-1 pr-0 md:items-end md:pt-2 md:text-right"
								>
									<span>{account.name}</span>
									<span class="text-muted-foreground font-normal">
										{m.accounts_link_account_details({
											type: titleCaseSubtype(account),
											mask: account.mask || m.accounts_link_no_mask()
										})}
									</span>
									<span class="text-muted-foreground font-normal">
										{formatCurrency(account.balance, 2, currency)}
									</span>
								</Label>
								<div class="space-y-2">
									<Select.Root
										type="single"
										value={matches[account.plaidAccountId].mode}
										onValueChange={(value) => {
											if (value === 'create' || value === 'existing') {
												matches[account.plaidAccountId].mode = value;
												formError = '';
											}
										}}
										disabled={isSaving}
									>
										<Select.Trigger
											id={`match-${account.plaidAccountId}`}
											class="bg-background w-full"
										>
											{matches[account.plaidAccountId].mode === 'create'
												? m.accounts_link_create_new()
												: m.accounts_link_existing()}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="create">
												{m.accounts_link_create_new()}
											</Select.Item>
											<Select.Item value="existing" disabled={eligibleAccounts.length === 0}>
												{m.accounts_link_existing()}
											</Select.Item>
										</Select.Content>
									</Select.Root>

									{#if matches[account.plaidAccountId].mode === 'existing'}
										<Select.Root
											type="single"
											value={matches[account.plaidAccountId].accountId}
											onValueChange={(value) => {
												matches[account.plaidAccountId].accountId = value;
												formError = '';
											}}
											disabled={isSaving}
										>
											<Select.Trigger class="bg-background w-full">
												{#if matches[account.plaidAccountId].accountId}
													{eligibleAccounts.find(
														(existing) => existing.id === matches[account.plaidAccountId].accountId
													)?.name}
												{:else}
													<span class="text-muted-foreground">
														{m.accounts_link_existing_placeholder()}
													</span>
												{/if}
											</Select.Trigger>
											<Select.Content>
												{#if eligibleAccounts.length === 0}
													<Select.Item value="__no-accounts" disabled>
														{m.accounts_link_existing_empty()}
													</Select.Item>
												{:else}
													{#each eligibleAccounts as existing (existing.id)}
														<Select.Item value={existing.id}>{existing.name}</Select.Item>
													{/each}
												{/if}
											</Select.Content>
										</Select.Root>
									{/if}
								</div>
							</FormFieldRow>
						{/each}
					</Fieldset>
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

					<footer class="border-border bg-border border-t p-2">
						<div class="flex justify-end">
							<Button type="submit" disabled={isSaving}>
								{isSaving ? m.accounts_link_confirming() : m.accounts_link_confirm()}
							</Button>
						</div>
					</footer>
				</form>
			</div>
		</Section>
	{/if}
</Page>
