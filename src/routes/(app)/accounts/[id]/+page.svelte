<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import { AccountsBalanceGroupOptions } from '$lib/pocketbase.schema';
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

		// Get latest balance
		try {
			const res = await pb.authedClient.collection('accountBalances').getList(1, 1, {
				filter: `account='${accountData.id}'`,
				sort: '-asOf,-created,-id'
			});
			newFormData.value = res.items[0]?.value?.toString() ?? '';
		} catch (error) {
			console.error('Failed to load balance:', error);
		}

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
		{:else}
			<BalanceForm {formData} onSubmit={handleUpdateBalance} />
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.accounts_section_details()} />
		{#if isLoading || !account}
			<Skeleton class="h-96" />
		{:else}
			<DetailsForm {formData} onSubmit={handleUpdateDetails} />
		{/if}
	</Section>
</Page>
