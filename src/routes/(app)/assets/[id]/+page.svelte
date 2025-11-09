<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import { getAssetsContext } from '$lib/assets.svelte';
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
	import { AssetsBalanceGroupOptions, AssetsTypeOptions } from '$lib/pocketbase.schema';
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
				assetData.type === AssetsTypeOptions.WHOLE ? (assetData.bookValue?.toString() ?? '') : '',
			marketValue:
				assetData.type === AssetsTypeOptions.WHOLE ? (assetData.marketValue?.toString() ?? '') : '',
			quantity:
				assetData.type === AssetsTypeOptions.SHARES ? (assetData.quantity?.toString() ?? '') : '',
			bookPrice:
				assetData.type === AssetsTypeOptions.SHARES ? (assetData.bookPrice?.toString() ?? '') : '',
			marketPrice:
				assetData.type === AssetsTypeOptions.SHARES ? (assetData.marketPrice?.toString() ?? '') : ''
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
		{:else}
			<BalanceForm {formData} {isWhole} {isShares} onSubmit={handleUpdateBalance} />
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.assets_section_details()} />
		{#if isLoading || !asset}
			<Skeleton class="h-96" />
		{:else}
			<DetailsForm {formData} {isWhole} {isShares} onSubmit={handleUpdateDetails} />
		{/if}
	</Section>
</Page>
