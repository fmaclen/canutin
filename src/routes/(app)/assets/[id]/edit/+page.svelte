<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAssetsContext } from '$lib/assets.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import RecordDangerZone from '$lib/components/record-danger-zone.svelte';
	import RecordSharingSection from '$lib/components/record-sharing-section.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { AssetsBalanceGroupOptions, AssetSharesPerspectiveOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { createRecordFormSync } from '$lib/record-form-sync.svelte';
	import { sanitizeFromParam } from '$lib/utils';

	import BalanceForm from '../balance-form.svelte';
	import DetailsForm from '../details-form.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const assetsContext = getAssetsContext();
	const balanceTypesContext = getBalanceTypesContext();

	const assetId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);

	const asset = $derived(assetId ? assetsContext.getAsset(assetId) : null);
	const isLoading = $derived(assetsContext.isLoading);
	const canWrite = $derived(Boolean(asset?.canWrite));
	const incomingShare = $derived(asset ? assetsContext.getIncomingShare(asset.id) : null);
	const grantedShares = $derived(asset ? assetsContext.getGrantedShares(asset.id) : []);

	let formData = $state({
		name: '',
		balanceGroup: '' as AssetsBalanceGroupOptions | '',
		balanceTypeName: '',
		notes: '',
		excluded: false,
		sold: false,
		bookValue: '',
		marketValue: ''
	});

	let shareRecipientEmail = $state('');
	let sharePerspective = $state<AssetSharesPerspectiveOptions>(
		AssetSharesPerspectiveOptions.NORMAL
	);
	let includeInNetWorth = $derived(incomingShare?.includeInNetWorth ?? true);

	function toFieldValue(value: number | null | undefined) {
		return value ? value.toString() : '';
	}

	const syncState = createRecordFormSync<NonNullable<typeof asset>, typeof formData>({
		getRecord: () => asset,
		getVersion: (assetData) =>
			`${assetData.updated || assetData.created}_${assetData.name}_${assetData.balanceGroup}_${assetData.notes}_${assetData.excluded}_${assetData.sold}_${assetData.marketValue}_${assetData.bookValue}`,
		getFormData: async (assetData) => {
			const newFormData = {
				name: assetData.name,
				balanceGroup: assetData.balanceGroup,
				balanceTypeName: '',
				notes: assetData.notes ?? '',
				excluded: Boolean(assetData.excluded),
				sold: Boolean(assetData.sold),
				bookValue: toFieldValue(assetData.bookValue),
				marketValue: toFieldValue(assetData.marketValue)
			};

			await balanceTypesContext.ensureLoaded(assetData.balanceType);
			newFormData.balanceTypeName = balanceTypesContext.getName(assetData.balanceType);

			return newFormData;
		},
		setFormData: (newFormData) => {
			formData = newFormData;
		},
		isDirty: (lastSyncedData) =>
			formData.name !== lastSyncedData.name ||
			formData.balanceGroup !== lastSyncedData.balanceGroup ||
			formData.balanceTypeName !== lastSyncedData.balanceTypeName ||
			formData.notes !== lastSyncedData.notes ||
			formData.excluded !== lastSyncedData.excluded ||
			formData.sold !== lastSyncedData.sold ||
			formData.bookValue !== lastSyncedData.bookValue ||
			formData.marketValue !== lastSyncedData.marketValue,
		dataStaleMessage: () => m.assets_edit_data_stale(),
		refreshLabel: () => m.assets_edit_refresh(),
		refreshedMessage: () => m.assets_edit_refreshed()
	});

	async function handleUpdateBalance() {
		const currentAssetId = assetId;
		const currentOwnerId = ownerId;
		if (!currentAssetId || !currentOwnerId || !asset) return;

		try {
			const balanceData: Record<string, unknown> = {
				asset: currentAssetId,
				owner: currentOwnerId,
				asOf: new Date().toISOString()
			};

			balanceData.bookValue = formData.bookValue ? parseFloat(formData.bookValue) : undefined;
			balanceData.marketValue = formData.marketValue ? parseFloat(formData.marketValue) : undefined;

			syncState.markSaving();

			await pb.authedClient.collection('assetBalances').create(balanceData);

			syncState.markSaved(formData);

			toast.success(m.assets_balance_updated());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('assetDetail', 'update_balance', error);
			toast.error(m.assets_balance_failed());
			syncState.markSaveFailed();
		}
	}

	async function handleUpdateDetails() {
		const currentAssetId = assetId;
		const currentOwnerId = ownerId;
		if (!currentAssetId || !currentOwnerId || !asset) return;

		try {
			const balanceTypeId = await balanceTypesContext.getOrCreate(
				formData.balanceTypeName,
				currentOwnerId
			);

			const assetData: Record<string, unknown> = {
				name: formData.name.trim(),
				balanceGroup: formData.balanceGroup as AssetsBalanceGroupOptions,
				balanceType: balanceTypeId,
				notes: formData.notes.trim() || undefined,
				excluded: formData.excluded ? new Date().toISOString() : null,
				sold: formData.sold ? new Date().toISOString() : null
			};

			syncState.markSaving();

			await pb.authedClient.collection('assets').update(currentAssetId, assetData);

			await balanceTypesContext.ensureLoaded(balanceTypeId);
			formData.balanceTypeName = balanceTypesContext.getName(balanceTypeId);

			syncState.markSaved(formData);

			toast.success(m.assets_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('assetDetail', 'update', error);
			toast.error(m.assets_edit_failed());
			syncState.markSaveFailed();
		}
	}

	async function handleDelete() {
		const currentAssetId = assetId;
		if (!currentAssetId) return;

		try {
			await assetsContext.deleteAsset(currentAssetId);
			toast.success(m.assets_delete_success());
			goto(resolve('/assets'));
		} catch (error) {
			logError('assetDetail', 'delete', error);
			toast.error(m.assets_delete_failed());
		}
	}

	async function handleCreateShare() {
		if (!asset || !canWrite) return;

		try {
			await assetsContext.createShare(asset.id, shareRecipientEmail, sharePerspective);
			shareRecipientEmail = '';
			sharePerspective = AssetSharesPerspectiveOptions.NORMAL;
			toast.success(m.assets_share_created());
		} catch (error) {
			logError('assetDetail', 'create_share', error);
			toast.error(error instanceof Error ? error.message : m.assets_share_create_failed());
		}
	}

	async function handleUpdateRecipientPreference() {
		if (!incomingShare) return;

		try {
			await assetsContext.updateShareIncludeInNetWorth(incomingShare.id, includeInNetWorth);
			toast.success(m.assets_share_preferences_updated());
		} catch (error) {
			logError('assetDetail', 'update_share_preferences', error);
			toast.error(m.assets_share_preferences_failed());
		}
	}

	async function handleRevokeShare(shareId: string) {
		try {
			await assetsContext.revokeShare(shareId);
			toast.success(m.assets_share_removed());
		} catch (error) {
			logError('assetDetail', 'revoke_share', error);
			toast.error(m.assets_share_remove_failed());
		}
	}

	async function handleLeaveShare() {
		if (!incomingShare) return;
		try {
			await assetsContext.revokeShare(incomingShare.id);
			toast.success(m.assets_share_left());
			goto(resolve('/assets'));
		} catch (error) {
			logError('assetDetail', 'leave_share', error);
			toast.error(m.assets_share_leave_failed());
		}
	}
</script>

<Section>
	<SectionTitle title={m.assets_section_balance()} />
	{#if isLoading || !asset}
		<Skeleton class="h-48" />
	{:else}
		<BalanceForm
			{formData}
			currency={asset.currency}
			balanceAsOf={asset.balanceAsOf}
			onSubmit={handleUpdateBalance}
			disabled={!canWrite}
		/>
	{/if}
</Section>

<Section>
	<SectionTitle title={m.assets_section_details()} />
	{#if isLoading || !asset}
		<Skeleton class="h-96" />
	{:else}
		<DetailsForm
			{formData}
			currency={asset.currency}
			onSubmit={handleUpdateDetails}
			disabled={!canWrite}
		/>
	{/if}
</Section>

<RecordSharingSection
	isLoading={isLoading || !asset}
	{canWrite}
	recordPerspective={asset?.perspective ?? AssetSharesPerspectiveOptions.NORMAL}
	{grantedShares}
	normalPerspective={AssetSharesPerspectiveOptions.NORMAL}
	inversePerspective={AssetSharesPerspectiveOptions.INVERSE}
	bind:shareRecipientEmail
	bind:sharePerspective
	bind:includeInNetWorth
	onCreateShare={handleCreateShare}
	onUpdateRecipientPreference={handleUpdateRecipientPreference}
	onRevokeShare={handleRevokeShare}
/>

<RecordDangerZone
	isLoading={isLoading || !asset}
	action={canWrite
		? {
				description: m.assets_delete_description(),
				subtext: m.assets_delete_subtext(),
				buttonLabel: m.assets_delete_button(),
				confirmTitle: m.assets_delete_confirm_title(),
				confirmDescription: m.assets_delete_confirm_description(),
				confirmCancelLabel: m.assets_delete_confirm_cancel(),
				confirmContinueLabel: m.assets_delete_confirm_continue(),
				onConfirm: handleDelete
			}
		: {
				description: m.assets_share_leave_description(),
				subtext: m.assets_share_leave_subtext(),
				buttonLabel: m.assets_share_leave_button(),
				confirmTitle: m.assets_share_leave_confirm_title(),
				confirmDescription: m.assets_share_leave_confirm_description(),
				confirmCancelLabel: m.assets_share_leave_confirm_cancel(),
				confirmContinueLabel: m.assets_share_leave_confirm_continue(),
				onConfirm: handleLeaveShare
			}}
/>
