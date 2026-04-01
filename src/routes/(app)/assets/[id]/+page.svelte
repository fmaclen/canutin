<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAssetsContext } from '$lib/assets.svelte';
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
		AssetsBalanceGroupOptions,
		AssetSharesPerspectiveOptions,
		AssetsTypeOptions
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import BalanceForm from './balance-form.svelte';
	import DetailsForm from './details-form.svelte';

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
		assetTypeName: '',
		symbol: '',
		excluded: false,
		sold: false,
		type: '' as AssetsTypeOptions | '',
		bookValue: '',
		marketValue: '',
		quantity: '',
		bookPrice: '',
		marketPrice: ''
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

	const isWhole = $derived(formData.type === AssetsTypeOptions.WHOLE);
	const isShares = $derived(formData.type === AssetsTypeOptions.SHARES);

	function isDirty(): boolean {
		if (!syncState.lastSyncedData) return false;

		return (
			formData.name !== syncState.lastSyncedData.name ||
			formData.balanceGroup !== syncState.lastSyncedData.balanceGroup ||
			formData.assetTypeName !== syncState.lastSyncedData.assetTypeName ||
			formData.symbol !== syncState.lastSyncedData.symbol ||
			formData.excluded !== syncState.lastSyncedData.excluded ||
			formData.sold !== syncState.lastSyncedData.sold ||
			formData.type !== syncState.lastSyncedData.type ||
			formData.bookValue !== syncState.lastSyncedData.bookValue ||
			formData.marketValue !== syncState.lastSyncedData.marketValue ||
			formData.quantity !== syncState.lastSyncedData.quantity ||
			formData.bookPrice !== syncState.lastSyncedData.bookPrice ||
			formData.marketPrice !== syncState.lastSyncedData.marketPrice
		);
	}

	function getAssetVersion(assetData: typeof asset): string {
		if (!assetData) return '';
		return `${assetData.updated || assetData.created}_${assetData.name}_${assetData.balanceGroup}_${assetData.symbol}_${assetData.excluded}_${assetData.sold}_${assetData.marketValue}_${assetData.bookValue}_${assetData.quantity}_${assetData.bookPrice}_${assetData.marketPrice}`;
	}

	function toFieldValue(value: number | null | undefined) {
		return value ? value.toString() : '';
	}

	async function syncFormWithAsset(assetData: typeof asset) {
		if (!assetData) return;

		const newFormData = {
			name: assetData.name,
			balanceGroup: assetData.balanceGroup,
			assetTypeName: '',
			symbol: assetData.symbol ?? '',
			excluded: Boolean(assetData.excluded),
			sold: Boolean(assetData.sold),
			type: assetData.type ?? '',
			bookValue:
				assetData.type === AssetsTypeOptions.WHOLE ? toFieldValue(assetData.bookValue) : '',
			marketValue:
				assetData.type === AssetsTypeOptions.WHOLE ? toFieldValue(assetData.marketValue) : '',
			quantity: assetData.type === AssetsTypeOptions.SHARES ? toFieldValue(assetData.quantity) : '',
			bookPrice:
				assetData.type === AssetsTypeOptions.SHARES ? toFieldValue(assetData.bookPrice) : '',
			marketPrice:
				assetData.type === AssetsTypeOptions.SHARES ? toFieldValue(assetData.marketPrice) : ''
		};

		await balanceTypesContext.ensureLoaded(assetData.balanceType);
		newFormData.assetTypeName = balanceTypesContext.getName(assetData.balanceType);

		formData = newFormData;
		syncState.lastSyncedData = { ...newFormData };
		syncState.remoteVersion = getAssetVersion(assetData);
		syncState.initialized = true;
	}

	$effect(() => {
		if (!asset) {
			if (!isLoading && assetId) {
				error(404, m.assets_edit_error_not_found());
			}
			return;
		}

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

			let calculatedBookValue: number | undefined;
			let calculatedMarketValue: number | undefined;

			if (isWhole) {
				calculatedBookValue = formData.bookValue ? parseFloat(formData.bookValue) : undefined;
				calculatedMarketValue = formData.marketValue ? parseFloat(formData.marketValue) : undefined;
				balanceData.bookValue = calculatedBookValue;
				balanceData.marketValue = calculatedMarketValue;
			} else if (isShares) {
				const qty = formData.quantity ? parseFloat(formData.quantity) : undefined;
				const bp = formData.bookPrice ? parseFloat(formData.bookPrice) : undefined;
				const mp = formData.marketPrice ? parseFloat(formData.marketPrice) : undefined;
				balanceData.quantity = qty;
				balanceData.bookPrice = bp;
				balanceData.marketPrice = mp;
				calculatedBookValue = qty !== undefined && bp !== undefined ? qty * bp : undefined;
				calculatedMarketValue = qty !== undefined && mp !== undefined ? qty * mp : undefined;
				balanceData.bookValue = calculatedBookValue;
				balanceData.marketValue = calculatedMarketValue;
			}

			syncState.justSaved = true;

			await pb.authedClient.collection('assetBalances').create(balanceData);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.assets_add_success());
		} catch (error) {
			console.error('Failed to update balance:', error);
			toast.error(m.assets_add_failed());
			syncState.justSaved = false;
		}
	}

	async function handleUpdateDetails() {
		const currentAssetId = assetId;
		const currentOwnerId = ownerId;
		if (!currentAssetId || !currentOwnerId || !asset) return;

		try {
			const balanceTypeId = await balanceTypesContext.getOrCreate(
				formData.assetTypeName,
				currentOwnerId
			);

			const assetData: Record<string, unknown> = {
				name: formData.name.trim(),
				balanceGroup: formData.balanceGroup as AssetsBalanceGroupOptions,
				balanceType: balanceTypeId,
				symbol: formData.symbol.trim() || undefined,
				excluded: formData.excluded ? new Date().toISOString() : null,
				sold: formData.sold ? new Date().toISOString() : null
			};

			syncState.justSaved = true;

			await pb.authedClient.collection('assets').update(currentAssetId, assetData);

			await balanceTypesContext.ensureLoaded(balanceTypeId);
			formData.assetTypeName = balanceTypesContext.getName(balanceTypeId);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.assets_edit_success());
		} catch (error) {
			console.error('Failed to update asset:', error);
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
			console.error('Failed to delete asset:', error);
			toast.error(m.assets_delete_failed());
		}
	}

	async function handleCreateShare() {
		if (!asset || !canWrite) return;

		try {
			await assetsContext.createShare(asset.id, shareRecipientEmail, sharePerspective);
			shareRecipientEmail = '';
			sharePerspective = AssetSharesPerspectiveOptions.NORMAL;
			toast.success('Share created');
		} catch (error) {
			console.error('Failed to create share:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to create share');
		}
	}

	async function handleUpdateRecipientPreference() {
		if (!incomingShare) return;

		try {
			await assetsContext.updateShareIncludeInNetWorth(incomingShare.id, includeInNetWorth);
			toast.success('Preferences updated');
		} catch (error) {
			console.error('Failed to update share preferences:', error);
			toast.error('Failed to update preferences');
		}
	}

	async function handleRevokeShare(shareId: string) {
		try {
			await assetsContext.revokeShare(shareId);
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
					<Breadcrumb.Link href="/assets">{m.sidebar_assets()}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if isLoading || !asset}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page>{asset.name}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.assets_edit_page_title()}>
	<Section>
		<SectionTitle title={m.assets_section_balance()} />
		{#if isLoading || !asset}
			<Skeleton class="h-48" />
		{:else if canWrite}
			<BalanceForm {formData} {isWhole} {isShares} onSubmit={handleUpdateBalance} />
		{:else}
			<div class="bg-muted border-border rounded border p-4">
				<p class="text-muted-foreground text-sm">This shared asset is read-only</p>
				<p class="mt-3 text-2xl font-semibold">
					{formData.marketValue || formData.bookValue || '$0'}
				</p>
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.assets_section_details()} />
		{#if isLoading || !asset}
			<Skeleton class="h-96" />
		{:else if canWrite}
			<DetailsForm {formData} {isWhole} {isShares} onSubmit={handleUpdateDetails} />
		{:else}
			<div class="bg-muted border-border rounded border p-4 text-sm">
				<div><strong>Name:</strong> {asset.name}</div>
				<div class="mt-2">
					<strong>Category:</strong>
					{assetsContext.getTypeName(asset.balanceType)}
				</div>
				<div class="mt-2"><strong>Balance group:</strong> {asset.balanceGroup}</div>
				{#if asset.symbol}
					<div class="mt-2"><strong>Symbol:</strong> {asset.symbol}</div>
				{/if}
			</div>
		{/if}
	</Section>

	<Section>
		<SectionTitle title="Sharing" />
		{#if isLoading || !asset}
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
							<option value={AssetSharesPerspectiveOptions.NORMAL}>Normal</option>
							<option value={AssetSharesPerspectiveOptions.INVERSE}>Inverse</option>
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
			{#if isLoading || !asset}
				<Skeleton class="h-24" />
			{:else}
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
			{/if}
		</Section>
	{/if}
</Page>
