<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import {
		AccountsBalanceGroupOptions,
		AccountSharesPerspectiveOptions
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import BalanceForm from './balance-form.svelte';
	import DetailsForm from './details-form.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();

	const accountId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);

	const account = $derived(accountId ? accountsContext.getAccount(accountId) : null);
	const isLoading = $derived(accountsContext.isLoading);
	const canWrite = $derived(Boolean(account?.canWrite));
	const incomingShare = $derived(account ? accountsContext.getIncomingShare(account.id) : null);
	const grantedShares = $derived(account ? accountsContext.getGrantedShares(account.id) : []);

	let formData = $state({
		name: '',
		institution: '',
		balanceGroup: '' as AccountsBalanceGroupOptions | '',
		accountTypeName: '',
		excluded: false,
		closed: false,
		value: ''
	});

	let syncState = $state({
		lastSyncedData: null as typeof formData | null,
		remoteVersion: null as string | null,
		justSaved: false,
		initialized: false
	});
	let shareRecipientEmail = $state('');
	let sharePerspective = $state<AccountSharesPerspectiveOptions>(
		AccountSharesPerspectiveOptions.NORMAL
	);
	let includeInNetWorth = $derived(incomingShare?.includeInNetWorth ?? true);

	function isDirty(): boolean {
		if (!syncState.lastSyncedData) return false;

		return (
			formData.name !== syncState.lastSyncedData.name ||
			formData.institution !== syncState.lastSyncedData.institution ||
			formData.balanceGroup !== syncState.lastSyncedData.balanceGroup ||
			formData.accountTypeName !== syncState.lastSyncedData.accountTypeName ||
			formData.excluded !== syncState.lastSyncedData.excluded ||
			formData.closed !== syncState.lastSyncedData.closed
		);
	}

	function getAccountVersion(accountData: typeof account): string {
		if (!accountData) return '';
		return `${accountData.updated || accountData.created}_${accountData.name}_${accountData.balanceGroup}_${accountData.institution}_${accountData.excluded}_${accountData.closed}`;
	}

	async function syncFormWithAccount(accountData: typeof account) {
		if (!accountData) return;

		const newFormData = {
			name: accountData.name,
			institution: accountData.institution ?? '',
			balanceGroup: accountData.balanceGroup,
			accountTypeName: '',
			excluded: Boolean(accountData.excluded),
			closed: Boolean(accountData.closed),
			value: ''
		};

		await balanceTypesContext.ensureLoaded(accountData.balanceType);
		newFormData.accountTypeName = balanceTypesContext.getName(accountData.balanceType);

		newFormData.value = accountData.balance.toString();

		formData = newFormData;
		syncState.lastSyncedData = { ...newFormData };
		syncState.remoteVersion = getAccountVersion(accountData);
		syncState.initialized = true;
	}

	$effect(() => {
		if (!account) {
			if (!isLoading && accountId) {
				error(404, m.accounts_edit_error_not_found());
			}
			return;
		}

		const currentVersion = getAccountVersion(account);

		if (!syncState.initialized) {
			syncFormWithAccount(account);
			return;
		}

		const remoteChanged = syncState.remoteVersion !== currentVersion;
		if (!remoteChanged) return;

		if (syncState.justSaved) {
			syncState.remoteVersion = currentVersion;
			syncState.justSaved = false;
			return;
		}

		if (isDirty()) {
			toast.warning(m.accounts_edit_data_stale(), {
				action: {
					label: m.accounts_edit_refresh(),
					onClick: () => {
						syncFormWithAccount(account);
						toast.success(m.accounts_edit_refreshed());
					}
				}
			});
			syncState.remoteVersion = currentVersion;
		} else {
			syncFormWithAccount(account);
		}
	});

	async function handleUpdateBalance() {
		const currentAccountId = accountId;
		const currentOwnerId = ownerId;
		if (!currentAccountId || !currentOwnerId || !account) return;

		try {
			const balanceData: Record<string, unknown> = {
				account: currentAccountId,
				owner: currentOwnerId,
				asOf: new Date().toISOString(),
				value: formData.value ? parseFloat(formData.value) : undefined
			};

			syncState.justSaved = true;

			await pb.authedClient.collection('accountBalances').create(balanceData);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.accounts_add_success());
		} catch (error) {
			console.error('Failed to update balance:', error);
			toast.error(m.accounts_add_failed());
			syncState.justSaved = false;
		}
	}

	async function handleUpdateDetails() {
		const currentAccountId = accountId;
		const currentOwnerId = ownerId;
		if (!currentAccountId || !currentOwnerId || !account) return;

		try {
			const balanceTypeId = await balanceTypesContext.getOrCreate(
				formData.accountTypeName,
				currentOwnerId
			);

			const accountData: Record<string, unknown> = {
				name: formData.name.trim(),
				balanceGroup: formData.balanceGroup as AccountsBalanceGroupOptions,
				balanceType: balanceTypeId,
				institution: formData.institution.trim() || undefined,
				excluded: formData.excluded ? new Date().toISOString() : null,
				closed: formData.closed ? new Date().toISOString() : null
			};

			syncState.justSaved = true;

			await pb.authedClient.collection('accounts').update(currentAccountId, accountData);

			await balanceTypesContext.ensureLoaded(balanceTypeId);
			formData.accountTypeName = balanceTypesContext.getName(balanceTypeId);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.accounts_edit_success());
		} catch (error) {
			console.error('Failed to update account:', error);
			toast.error(m.accounts_edit_failed());
			syncState.justSaved = false;
		}
	}

	async function handleDelete() {
		const currentAccountId = accountId;
		if (!currentAccountId) return;

		try {
			await accountsContext.deleteAccount(currentAccountId);
			toast.success(m.accounts_delete_success());
			goto(resolve('/accounts'));
		} catch (error) {
			console.error('Failed to delete account:', error);
			toast.error(m.accounts_delete_failed());
		}
	}

	async function handleCreateShare() {
		if (!account || !canWrite) return;

		try {
			await accountsContext.createShare(account.id, shareRecipientEmail, sharePerspective);
			shareRecipientEmail = '';
			sharePerspective = AccountSharesPerspectiveOptions.NORMAL;
			toast.success('Share created');
		} catch (error) {
			console.error('Failed to create share:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to create share');
		}
	}

	async function handleUpdateRecipientPreference() {
		if (!incomingShare) return;

		try {
			await accountsContext.updateShareIncludeInNetWorth(incomingShare.id, includeInNetWorth);
			toast.success('Preferences updated');
		} catch (error) {
			console.error('Failed to update share preferences:', error);
			toast.error('Failed to update preferences');
		}
	}

	async function handleRevokeShare(shareId: string) {
		try {
			await accountsContext.revokeShare(shareId);
			toast.success('Share removed');
		} catch (error) {
			console.error('Failed to revoke share:', error);
			toast.error('Failed to remove share');
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
					{#if isLoading || !account}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page>{account.name}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.accounts_edit_page_title()}>
	<Section>
		<SectionTitle title={m.accounts_section_balance()} />
		{#if isLoading || !account}
			<Skeleton class="h-48" />
		{:else if canWrite}
			<BalanceForm {formData} onSubmit={handleUpdateBalance} />
		{:else}
			<div class="bg-muted border-border rounded border p-4">
				<p class="text-muted-foreground text-sm">This shared account is read-only</p>
				<p class="mt-3 text-2xl font-semibold">{formData.value}</p>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.accounts_section_details()} />
		{#if isLoading || !account}
			<Skeleton class="h-96" />
		{:else if canWrite}
			<DetailsForm {formData} onSubmit={handleUpdateDetails} />
		{:else}
			<div class="bg-muted border-border rounded border p-4 text-sm">
				<div><strong>Name:</strong> {account.name}</div>
				<div class="mt-2"><strong>Institution:</strong> {account.institution || '~'}</div>
				<div class="mt-2">
					<strong>Category:</strong>
					{accountsContext.getTypeName(account.balanceType)}
				</div>
				<div class="mt-2"><strong>Balance group:</strong> {account.balanceGroup}</div>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title="Sharing" />
		{#if isLoading || !account}
			<Skeleton class="h-40" />
		{:else if canWrite}
			<div class="bg-muted border-border rounded border p-4">
				<form
					class="grid gap-3 md:grid-cols-[1fr_160px_auto]"
					onsubmit={(e) => {
						e.preventDefault();
						handleCreateShare();
					}}
				>
					<div class="space-y-2">
						<Label for="share-email">Recipient email</Label>
						<Input id="share-email" bind:value={shareRecipientEmail} type="email" required />
					</div>
					<div class="space-y-2">
						<Label for="share-perspective">Perspective</Label>
						<select
							id="share-perspective"
							class="bg-background border-border h-9 w-full rounded border px-3 text-sm"
							bind:value={sharePerspective}
						>
							<option value={AccountSharesPerspectiveOptions.NORMAL}>Normal</option>
							<option value={AccountSharesPerspectiveOptions.INVERSE}>Inverse</option>
						</select>
					</div>
					<div class="flex items-end">
						<Button type="submit">Share</Button>
					</div>
				</form>

				{#if grantedShares.length > 0}
					<div class="mt-4 space-y-2">
						{#each grantedShares as share (share.id)}
							<div
								class="bg-background border-border flex items-center justify-between rounded border px-3 py-2 text-sm"
							>
								<div>
									<div>{share.recipientEmail}</div>
									<div class="text-muted-foreground">
										{share.perspective === 'INVERSE' ? 'Inverse' : 'Normal'} •
										{share.includeInNetWorth
											? ' included in net worth'
											: ' excluded from net worth'}
									</div>
								</div>
								<Button variant="outline" onclick={() => handleRevokeShare(share.id)}>Remove</Button
								>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="bg-muted border-border rounded border p-4">
				<form
					class="space-y-3"
					onsubmit={(e) => {
						e.preventDefault();
						handleUpdateRecipientPreference();
					}}
				>
					<label class="flex items-center gap-2 text-sm" for="include-in-net-worth">
						<input id="include-in-net-worth" type="checkbox" bind:checked={includeInNetWorth} />
						<span>Include in my net worth</span>
					</label>
					<Button type="submit">Save preferences</Button>
				</form>
			</div>
		{/if}
	</Section>

	{#if canWrite || isLoading}
		<Section>
			<SectionTitle title={m.danger_zone_title()} />
			{#if isLoading || !account}
				<Skeleton class="h-24" />
			{:else}
				<div
					class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
				>
					<div class="flex items-center justify-between p-4">
						<div>
							<p class="text-sm">
								{m.accounts_delete_description()}
							</p>
							<p class="text-destructive text-sm">
								{m.accounts_delete_subtext()}
							</p>
						</div>
						<AlertDialog.Root>
							<AlertDialog.Trigger>
								<Button variant="destructive">{m.accounts_delete_button()}</Button>
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>{m.accounts_delete_confirm_title()}</AlertDialog.Title>
									<AlertDialog.Description>
										{m.accounts_delete_confirm_description()}
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>{m.accounts_delete_confirm_cancel()}</AlertDialog.Cancel>
									<AlertDialog.Action onclick={handleDelete}>
										{m.accounts_delete_confirm_continue()}
									</AlertDialog.Action>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</div>
			{/if}
		</Section>
	{/if}
</Page>
