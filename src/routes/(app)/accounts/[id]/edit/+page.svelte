<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import Empty from '$lib/components/empty.svelte';
	import ImportSessionsTable from '$lib/components/import-sessions-table.svelte';
	import RecordDangerZone from '$lib/components/record-danger-zone.svelte';
	import RecordSharingSection from '$lib/components/record-sharing-section.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getImportSessionsContext } from '$lib/import-sessions.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import {
		AccountBalancesSourceOptions,
		AccountsBalanceGroupOptions,
		AccountSharesPerspectiveOptions
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { createRecordFormSync } from '$lib/record-form-sync.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { sanitizeFromParam } from '$lib/utils';

	import BalanceForm from '../balance-form.svelte';
	import ConnectionSection from '../connection-section.svelte';
	import DetailsForm from '../details-form.svelte';

	const RECENT_IMPORTS_LIMIT = 5;

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();
	const securitiesContext = getSecuritiesContext();
	const importSessionsContext = getImportSessionsContext();

	const accountId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);

	const account = $derived(accountId ? accountsContext.getAccount(accountId) : null);
	const isLoading = $derived(accountsContext.isLoading);
	const canWrite = $derived(Boolean(account?.canWrite));
	// Only the owner of a linked account can see or manage its bank connection; recipients of a share
	// get the plain account.
	const connectionId = $derived(account?.isOwner ? account.connection : '');
	// The bank owns a linked account's institution, category, group and balance regardless of who is
	// looking at it, so recipients of a share can't edit them either.
	const isLinked = $derived(Boolean(account?.connection));
	const recentConnectionImports = $derived(
		connectionId
			? importSessionsContext.sessions
					.filter((session) => session.connection === connectionId)
					.slice(0, RECENT_IMPORTS_LIMIT)
			: []
	);
	const incomingShare = $derived(account ? accountsContext.getIncomingShare(account.id) : null);
	const grantedShares = $derived(account ? accountsContext.getGrantedShares(account.id) : []);
	const hasPositions = $derived(
		account
			? securitiesContext.securities.some((security) =>
					securitiesContext
						.getAccountBalances(security.id)
						.some((balance) => balance.accountId === account.id && balance.quantity !== 0)
				)
			: false
	);

	let formData = $state({
		name: '',
		institution: '',
		balanceGroup: '' as AccountsBalanceGroupOptions | '',
		accountTypeName: '',
		notes: '',
		excluded: false,
		closed: false,
		value: ''
	});

	let shareRecipientEmail = $state('');
	let sharePerspective = $state<AccountSharesPerspectiveOptions>(
		AccountSharesPerspectiveOptions.NORMAL
	);
	let includeInNetWorth = $derived(incomingShare?.includeInNetWorth ?? true);

	const syncState = createRecordFormSync<NonNullable<typeof account>, typeof formData>({
		getRecord: () => account,
		getVersion: (accountData) =>
			`${accountData.updated || accountData.created}_${accountData.name}_${accountData.balanceGroup}_${accountData.institution}_${accountData.notes}_${accountData.excluded}_${accountData.closed}`,
		getFormData: async (accountData) => {
			const newFormData = {
				name: accountData.name,
				institution: accountData.institution ?? '',
				balanceGroup: accountData.balanceGroup,
				accountTypeName: '',
				notes: accountData.notes ?? '',
				excluded: Boolean(accountData.excluded),
				closed: Boolean(accountData.closed),
				value: accountData.cashBalance.toString()
			};

			await balanceTypesContext.ensureLoaded(accountData.balanceType);
			newFormData.accountTypeName = balanceTypesContext.getName(accountData.balanceType);

			return newFormData;
		},
		setFormData: (newFormData) => {
			formData = newFormData;
		},
		isDirty: (lastSyncedData) =>
			formData.name !== lastSyncedData.name ||
			formData.institution !== lastSyncedData.institution ||
			formData.balanceGroup !== lastSyncedData.balanceGroup ||
			formData.accountTypeName !== lastSyncedData.accountTypeName ||
			formData.notes !== lastSyncedData.notes ||
			formData.excluded !== lastSyncedData.excluded ||
			formData.closed !== lastSyncedData.closed,
		dataStaleMessage: () => m.accounts_edit_data_stale(),
		refreshLabel: () => m.accounts_edit_refresh(),
		refreshedMessage: () => m.accounts_edit_refreshed()
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
				value: formData.value ? parseFloat(formData.value) : undefined,
				source: AccountBalancesSourceOptions.manual
			};

			syncState.markSaving();

			await pb.authedClient.collection('accountBalances').create(balanceData);

			syncState.markSaved(formData);

			toast.success(m.accounts_balance_updated());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('accountDetail', 'update_balance', error);
			toast.error(m.accounts_balance_failed());
			syncState.markSaveFailed();
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
				notes: formData.notes.trim() || undefined,
				excluded: formData.excluded ? new Date().toISOString() : null,
				closed: formData.closed ? new Date().toISOString() : null
			};

			syncState.markSaving();

			await pb.authedClient.collection('accounts').update(currentAccountId, accountData);

			await balanceTypesContext.ensureLoaded(balanceTypeId);
			formData.accountTypeName = balanceTypesContext.getName(balanceTypeId);

			syncState.markSaved(formData);

			toast.success(m.accounts_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('accountDetail', 'update', error);
			toast.error(m.accounts_edit_failed());
			syncState.markSaveFailed();
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
			logError('accountDetail', 'delete', error);
			toast.error(m.accounts_delete_failed());
		}
	}

	async function handleCreateShare() {
		if (!account || !canWrite) return;

		try {
			await accountsContext.createShare(account.id, shareRecipientEmail, sharePerspective);
			shareRecipientEmail = '';
			sharePerspective = AccountSharesPerspectiveOptions.NORMAL;
			toast.success(m.accounts_share_created());
		} catch (error) {
			logError('accountDetail', 'create_share', error);
			toast.error(error instanceof Error ? error.message : m.accounts_share_create_failed());
		}
	}

	async function handleUpdateRecipientPreference() {
		if (!incomingShare) return;

		try {
			await accountsContext.updateShareIncludeInNetWorth(incomingShare.id, includeInNetWorth);
			toast.success(m.accounts_share_preferences_updated());
		} catch (error) {
			logError('accountDetail', 'update_share_preferences', error);
			toast.error(m.accounts_share_preferences_failed());
		}
	}

	async function handleRevokeShare(shareId: string) {
		try {
			await accountsContext.revokeShare(shareId);
			toast.success(m.accounts_share_removed());
		} catch (error) {
			logError('accountDetail', 'revoke_share', error);
			toast.error(m.accounts_share_remove_failed());
		}
	}

	async function handleLeaveShare() {
		if (!incomingShare) return;
		try {
			await accountsContext.revokeShare(incomingShare.id);
			toast.success(m.accounts_share_left());
			goto(resolve('/accounts'));
		} catch (error) {
			logError('accountDetail', 'leave_share', error);
			toast.error(m.accounts_share_leave_failed());
		}
	}

	const dangerZoneAction = $derived.by(() => {
		if (!canWrite)
			return {
				description: m.accounts_share_leave_description(),
				subtext: m.accounts_share_leave_subtext(),
				buttonLabel: m.accounts_share_leave_button(),
				confirmTitle: m.accounts_share_leave_confirm_title(),
				confirmDescription: m.accounts_share_leave_confirm_description(),
				confirmCancelLabel: m.accounts_share_leave_confirm_cancel(),
				confirmContinueLabel: m.accounts_share_leave_confirm_continue(),
				onConfirm: handleLeaveShare
			};

		return {
			description: m.accounts_delete_description(),
			subtext: m.accounts_delete_subtext(),
			buttonLabel: m.accounts_delete_button(),
			confirmTitle: m.accounts_delete_confirm_title(),
			confirmDescription: m.accounts_delete_confirm_description(),
			confirmCancelLabel: m.accounts_delete_confirm_cancel(),
			confirmContinueLabel: m.accounts_delete_confirm_continue(),
			onConfirm: handleDelete
		};
	});
</script>

{#if connectionId}
	<ConnectionSection {connectionId} />
{/if}

<Section>
	<SectionTitle title={m.accounts_section_balance()} />
	{#if isLoading || !account}
		<Skeleton class="h-48" />
	{:else}
		<BalanceForm
			{formData}
			currency={account.currency}
			balanceAsOf={account.balanceAsOf}
			onSubmit={handleUpdateBalance}
			disabled={!canWrite || isLinked}
			{hasPositions}
		/>
	{/if}
</Section>

<Section>
	<SectionTitle title={m.accounts_section_details()} />
	{#if isLoading || !account}
		<Skeleton class="h-96" />
	{:else}
		<DetailsForm
			{formData}
			currency={account.currency}
			accountNumber={account.externalMask}
			onSubmit={handleUpdateDetails}
			disabled={!canWrite}
			{isLinked}
		/>
	{/if}
</Section>

<RecordSharingSection
	isLoading={isLoading || !account}
	{canWrite}
	recordPerspective={account?.perspective ?? AccountSharesPerspectiveOptions.NORMAL}
	{grantedShares}
	normalPerspective={AccountSharesPerspectiveOptions.NORMAL}
	inversePerspective={AccountSharesPerspectiveOptions.INVERSE}
	bind:shareRecipientEmail
	bind:sharePerspective
	bind:includeInNetWorth
	onCreateShare={handleCreateShare}
	onUpdateRecipientPreference={handleUpdateRecipientPreference}
	onRevokeShare={handleRevokeShare}
/>

{#if connectionId}
	<Section>
		<SectionTitle title={m.accounts_connection_imports_section_title()} />
		{#if importSessionsContext.isLoading}
			<Skeleton class="h-64" showSpinner />
		{:else if recentConnectionImports.length === 0}
			<Empty>{m.settings_imports_empty()}</Empty>
		{:else}
			<ImportSessionsTable
				rows={recentConnectionImports}
				viewAll={{
					href: resolve('/settings/imports'),
					label: m.accounts_connection_imports_view_all()
				}}
			/>
		{/if}
	</Section>
{/if}

{#if !connectionId}
	<!-- A linked account can't be deleted or left from here: its connection covers every account it
	was linked with, so it is unlinked from Settings > Connections instead. -->
	<RecordDangerZone isLoading={isLoading || !account} action={dangerZoneAction} />
{/if}
