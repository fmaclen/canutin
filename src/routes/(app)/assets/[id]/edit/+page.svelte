<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAssetsContext } from '$lib/assets.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { AssetsBalanceGroupOptions, AssetSharesPerspectiveOptions } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
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

	let syncState = $state({
		lastSyncedData: null as typeof formData | null,
		remoteVersion: null as string | null,
		justSaved: false,
		initialized: false
	});
	let shareRecipientEmail = $state('');
	let sharePerspective = $state<AssetSharesPerspectiveOptions>(
		AssetSharesPerspectiveOptions.NORMAL
	);
	let includeInNetWorth = $derived(incomingShare?.includeInNetWorth ?? true);

	function isDirty() {
		if (!syncState.lastSyncedData) return false;

		return (
			formData.name !== syncState.lastSyncedData.name ||
			formData.balanceGroup !== syncState.lastSyncedData.balanceGroup ||
			formData.balanceTypeName !== syncState.lastSyncedData.balanceTypeName ||
			formData.notes !== syncState.lastSyncedData.notes ||
			formData.excluded !== syncState.lastSyncedData.excluded ||
			formData.sold !== syncState.lastSyncedData.sold ||
			formData.bookValue !== syncState.lastSyncedData.bookValue ||
			formData.marketValue !== syncState.lastSyncedData.marketValue
		);
	}

	function getAssetVersion(assetData: typeof asset) {
		if (!assetData) return '';
		return `${assetData.updated || assetData.created}_${assetData.name}_${assetData.balanceGroup}_${assetData.notes}_${assetData.excluded}_${assetData.sold}_${assetData.marketValue}_${assetData.bookValue}`;
	}

	function toFieldValue(value: number | null | undefined) {
		return value ? value.toString() : '';
	}

	async function syncFormWithAsset(assetData: typeof asset) {
		if (!assetData) return;

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

		formData = newFormData;
		syncState.lastSyncedData = { ...newFormData };
		syncState.remoteVersion = getAssetVersion(assetData);
		syncState.initialized = true;
	}

	$effect(() => {
		if (!asset) return;

		const currentVersion = getAssetVersion(asset);

		if (!syncState.initialized) {
			syncFormWithAsset(asset);
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
			toast.warning(m.assets_edit_data_stale(), {
				action: {
					label: m.assets_edit_refresh(),
					onClick: () => {
						syncFormWithAsset(asset);
						toast.success(m.assets_edit_refreshed());
					}
				}
			});
			syncState.remoteVersion = currentVersion;
		} else {
			syncFormWithAsset(asset);
		}
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

			syncState.justSaved = true;

			await pb.authedClient.collection('assetBalances').create(balanceData);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.assets_balance_updated());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('assetDetail', 'update_balance', error);
			toast.error(m.assets_balance_failed());
			syncState.justSaved = false;
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

			syncState.justSaved = true;

			await pb.authedClient.collection('assets').update(currentAssetId, assetData);

			await balanceTypesContext.ensureLoaded(balanceTypeId);
			formData.balanceTypeName = balanceTypesContext.getName(balanceTypeId);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.assets_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('assetDetail', 'update', error);
			toast.error(m.assets_edit_failed());
			syncState.justSaved = false;
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

	function perspectiveLabel(perspective: AssetSharesPerspectiveOptions) {
		return perspective === AssetSharesPerspectiveOptions.INVERSE ? 'Inverse' : 'Normal';
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
			balanceAsOf={asset?.balanceAsOf ?? ''}
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

<Section>
	<SectionTitle title={m.assets_section_sharing()} />
	{#if isLoading || !asset}
		<Skeleton class="h-40" />
	{:else if canWrite}
		<div class="border-border overflow-hidden rounded border">
			<form
				class="space-y-0"
				onsubmit={(e) => {
					e.preventDefault();
					handleCreateShare();
				}}
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="share-email" class="justify-start pr-0 md:justify-end">Email</Label>
						<Input id="share-email" bind:value={shareRecipientEmail} type="email" required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="share-perspective" class="justify-start pr-0 md:justify-end"
							>Perspective</Label
						>
						<Select.Root type="single" bind:value={sharePerspective}>
							<Select.Trigger id="share-perspective" class="bg-background w-full">
								{perspectiveLabel(sharePerspective)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={AssetSharesPerspectiveOptions.NORMAL}>Normal</Select.Item>
								<Select.Item value={AssetSharesPerspectiveOptions.INVERSE}>Inverse</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5">Shares</Label>
						<div class="space-y-2">
							{#if grantedShares.length === 0}
								<Input disabled placeholder="No shares yet" />
							{:else}
								{#each grantedShares as share (share.id)}
									<div
										class="bg-background border-border flex items-start justify-between gap-3 rounded border px-3 py-2.5"
									>
										<div class="min-w-0 text-sm">
											<p class="truncate">{share.recipientEmail}</p>
											<p class="text-muted-foreground">
												{perspectiveLabel(share.perspective)} perspective
												{share.includeInNetWorth
													? ' · included in net worth'
													: ' · excluded from net worth'}
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											onclick={() => handleRevokeShare(share.id)}>Remove</Button
										>
									</div>
								{/each}
							{/if}
						</div>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.assets_share_button()}</Button>
					</div>
				</footer>
			</form>
		</div>
	{:else}
		<div class="border-border overflow-hidden rounded border">
			<form
				class="space-y-0"
				onsubmit={(e) => {
					e.preventDefault();
					handleUpdateRecipientPreference();
				}}
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="perspective" class="justify-start pr-0 md:justify-end">Perspective</Label>
						<Input id="perspective" value={perspectiveLabel(asset.perspective)} disabled />
					</FormFieldRow>

					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5">Marked as</Label>
						<CheckboxLabel
							id="include-in-net-worth"
							bind:checked={includeInNetWorth}
							label="Include in net worth"
							class="bg-background"
						/>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.assets_button_save()}</Button>
					</div>
				</footer>
			</form>
		</div>
	{/if}
</Section>

<Section>
	<SectionTitle title={m.danger_zone_title()} />
	{#if isLoading || !asset}
		<Skeleton class="h-24" />
	{:else if canWrite}
		<div
			class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
		>
			<div class="flex items-center justify-between p-4">
				<div>
					<p class="text-sm">
						{m.assets_delete_description()}
					</p>
					<p class="text-destructive text-sm">
						{m.assets_delete_subtext()}
					</p>
				</div>
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						<Button variant="destructive">{m.assets_delete_button()}</Button>
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.assets_delete_confirm_title()}</AlertDialog.Title>
							<AlertDialog.Description>
								{m.assets_delete_confirm_description()}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.assets_delete_confirm_cancel()}</AlertDialog.Cancel>
							<AlertDialog.Action onclick={handleDelete}>
								{m.assets_delete_confirm_continue()}
							</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</div>
		</div>
	{:else}
		<div
			class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
		>
			<div class="flex items-center justify-between p-4">
				<div>
					<p class="text-sm">
						{m.assets_share_leave_description()}
					</p>
					<p class="text-destructive text-sm">
						{m.assets_share_leave_subtext()}
					</p>
				</div>
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						<Button variant="destructive">{m.assets_share_leave_button()}</Button>
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.assets_share_leave_confirm_title()}</AlertDialog.Title>
							<AlertDialog.Description>
								{m.assets_share_leave_confirm_description()}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.assets_share_leave_confirm_cancel()}</AlertDialog.Cancel>
							<AlertDialog.Action onclick={handleLeaveShare}>
								{m.assets_share_leave_confirm_continue()}
							</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</div>
		</div>
	{/if}
</Section>
