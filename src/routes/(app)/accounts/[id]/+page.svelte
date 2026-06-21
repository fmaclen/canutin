<script lang="ts">
	import UsersIcon from '@lucide/svelte/icons/users';
	import { error } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountCashflowContext } from '$lib/account-cashflow.svelte';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getBalanceTypesContext } from '$lib/balance-types.svelte';
	import CashflowAverages from '$lib/components/cashflow-averages.svelte';
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import KeyValue from '$lib/components/key-value.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import {
		AccountsBalanceGroupOptions,
		AccountSharesPerspectiveOptions
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import {
		formatSecurityQuantity,
		gainLossPercentOrNull,
		sumOrUnknown
	} from '$lib/security-balance-values';
	import {
		createSortComparator,
		formatPercent,
		getSortFromUrl,
		sanitizeFromParam,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	import BalanceForm from './balance-form.svelte';
	import DetailsForm from './details-form.svelte';

	const pb = getPocketBaseContext();
	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const balanceTypesContext = getBalanceTypesContext();
	const securitiesContext = getSecuritiesContext();
	const accountCashflow = getAccountCashflowContext();

	const accountId = $derived(page.params.id);
	const ownerId = $derived(auth.currentUser?.record?.id);

	const account = $derived(accountId ? accountsContext.getAccount(accountId) : null);
	const isLoading = $derived(accountsContext.isLoading);
	const canWrite = $derived(Boolean(account?.canWrite));
	const incomingShare = $derived(account ? accountsContext.getIncomingShare(account.id) : null);
	const grantedShares = $derived(account ? accountsContext.getGrantedShares(account.id) : []);
	const positionsBalances = $derived(
		account
			? securitiesContext.securities.flatMap((security) =>
					securitiesContext
						.getAccountBalances(security.id)
						.filter((balance) => balance.accountId === account.id && balance.quantity !== 0)
				)
			: []
	);
	type PositionSortColumn =
		| 'asOf'
		| 'securityName'
		| 'quantity'
		| 'price'
		| 'costBasis'
		| 'gainLoss'
		| 'gainLossPercent'
		| 'value';
	const validSortColumns: PositionSortColumn[] = [
		'asOf',
		'securityName',
		'quantity',
		'price',
		'costBasis',
		'gainLoss',
		'gainLossPercent',
		'value'
	];

	const defaultSort: SortState<PositionSortColumn> = { column: 'value', direction: 'desc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl(page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as PositionSortColumn)
		) {
			return urlSort as SortState<PositionSortColumn>;
		}
		return defaultSort;
	});

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as PositionSortColumn);
		const newUrl = setSortInUrl(page.url, newState);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	const positionsRows = $derived.by(() => {
		const rows = positionsBalances.map((balance) => ({
			...balance,
			securityName: securitiesContext.getSecurity(balance.securityId)?.name ?? ''
		}));

		const comparator = createSortComparator<(typeof rows)[number], PositionSortColumn>(sortState, {
			asOf: (row) => new Date(row.asOf).getTime(),
			securityName: (row) => row.securityName,
			quantity: (row) => row.quantity,
			price: (row) => row.price,
			costBasis: (row) => row.costBasis,
			gainLoss: (row) => row.gainLoss,
			gainLossPercent: (row) => gainLossPercentOrNull(row.gainLoss, row.costBasis),
			value: (row) => row.value
		});
		return rows.sort(comparator);
	});
	const positionsMarketValue = $derived(sumOrUnknown(positionsRows.map((row) => row.value)));
	const dateFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});

	function sentiment(value: number | null) {
		if (value === null || value === 0) return 'neutral';
		return value > 0 ? 'positive' : 'negative';
	}

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

	function isDirty() {
		if (!syncState.lastSyncedData) return false;

		return (
			formData.name !== syncState.lastSyncedData.name ||
			formData.institution !== syncState.lastSyncedData.institution ||
			formData.balanceGroup !== syncState.lastSyncedData.balanceGroup ||
			formData.accountTypeName !== syncState.lastSyncedData.accountTypeName ||
			formData.notes !== syncState.lastSyncedData.notes ||
			formData.excluded !== syncState.lastSyncedData.excluded ||
			formData.closed !== syncState.lastSyncedData.closed
		);
	}

	function getAccountVersion(accountData: typeof account) {
		if (!accountData) return '';
		return `${accountData.updated || accountData.created}_${accountData.name}_${accountData.balanceGroup}_${accountData.institution}_${accountData.notes}_${accountData.excluded}_${accountData.closed}`;
	}

	async function syncFormWithAccount(accountData: typeof account) {
		if (!accountData) return;

		const newFormData = {
			name: accountData.name,
			institution: accountData.institution ?? '',
			balanceGroup: accountData.balanceGroup,
			accountTypeName: '',
			notes: accountData.notes ?? '',
			excluded: Boolean(accountData.excluded),
			closed: Boolean(accountData.closed),
			value: ''
		};

		await balanceTypesContext.ensureLoaded(accountData.balanceType);
		newFormData.accountTypeName = balanceTypesContext.getName(accountData.balanceType);

		newFormData.value = accountData.cashBalance.toString();

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

			toast.success(m.accounts_balance_updated());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('accountDetail', 'update_balance', error);
			toast.error(m.accounts_balance_failed());
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
				notes: formData.notes.trim() || undefined,
				excluded: formData.excluded ? new Date().toISOString() : null,
				closed: formData.closed ? new Date().toISOString() : null
			};

			syncState.justSaved = true;

			await pb.authedClient.collection('accounts').update(currentAccountId, accountData);

			await balanceTypesContext.ensureLoaded(balanceTypeId);
			formData.accountTypeName = balanceTypesContext.getName(balanceTypeId);

			syncState.lastSyncedData = { ...formData };

			toast.success(m.accounts_edit_success());

			const from = sanitizeFromParam(page.url.searchParams.get('from'));
			if (from) {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized dynamic ?from= redirect
				await goto(from);
			}
		} catch (error) {
			logError('accountDetail', 'update', error);
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

	function perspectiveLabel(perspective: AccountSharesPerspectiveOptions) {
		return perspective === AccountSharesPerspectiveOptions.INVERSE ? 'Inverse' : 'Normal';
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/accounts')}>{m.sidebar_accounts()}</Breadcrumb.Link>
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
	<nav class="flex items-center gap-4 px-4">
		{#if account}
			<Link href={`${resolve('/transactions')}?account=${account.id}`} class="text-sm">
				{m.sidebar_transactions()}
			</Link>
			<Link href={`${resolve('/trades')}?account=${account.id}`} class="text-sm">
				{m.trades_title()}
			</Link>
		{/if}
	</nav>
</header>

<Page pageTitle={m.accounts_edit_page_title()}>
	{#if !isLoading && account && !canWrite}
		<Section>
			<div class="bg-muted border-border overflow-hidden rounded border">
				<div class="flex items-center justify-between p-4">
					<div>
						<p class="flex items-center gap-2 text-sm">
							<UsersIcon class="text-muted-foreground size-3.5" aria-hidden="true" />
							This shared account is read-only
						</p>
						<p class="text-muted-foreground text-sm">
							Stop following this account and remove it from your views
						</p>
					</div>
					<AlertDialog.Root>
						<AlertDialog.Trigger>
							<Button variant="outline">Leave</Button>
						</AlertDialog.Trigger>
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
								<AlertDialog.Description>
									You will no longer see this account or its transactions. The owner can share it
									with you again later.
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
								<AlertDialog.Action onclick={handleLeaveShare}>Continue</AlertDialog.Action>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Root>
				</div>
			</div>
		</Section>
	{/if}

	{#if !isLoading && account && positionsRows.length > 0}
		<Section>
			<SectionTitle title={m.portfolio_section_positions()} />
			<div
				role="region"
				aria-label={m.portfolio_section_positions()}
				class="grid grid-cols-1 gap-2"
			>
				<KeyValue
					title={m.summary_net_market_value()}
					value={positionsMarketValue}
					variant="outline"
					decimalScale={2}
				/>
			</div>
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="asOf"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_as_of()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="securityName"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_security()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="quantity"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_quantity()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="price"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_price()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="costBasis"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_cost_basis()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="gainLoss"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_gain_loss()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="gainLossPercent"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_gain_loss_percent()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="value"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.securities_table_header_value()}
							</Table.SortableHead>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each positionsRows as row (row.id)}
							{@const gainLossPercent = gainLossPercentOrNull(row.gainLoss, row.costBasis)}
							<Table.Row>
								<Table.Cell
									class="text-muted-foreground font-mono whitespace-nowrap uppercase tabular-nums"
								>
									{dateFormatter.format(new Date(row.asOf))}
								</Table.Cell>
								<Table.Cell>
									<Link
										href={resolve(`/trades/securities/${row.securityId}`)}
										class="text-foreground/90 text-sm font-medium"
									>
										{row.securityName}
									</Link>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.quantity === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<NumberDisplay value={formatSecurityQuantity(row.quantity)} />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.price === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency value={row.price} decimalScale={2} />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.costBasis === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency value={row.costBasis} decimalScale={2} />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.gainLoss === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency
											value={row.gainLoss}
											decimalScale={2}
											sentiment={sentiment(row.gainLoss)}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if gainLossPercent === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<NumberDisplay
											value={formatPercent(gainLossPercent)}
											sentiment={gainLossPercent > 0
												? 'positive'
												: gainLossPercent < 0
													? 'negative'
													: 'neutral'}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if row.value === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency value={row.value} decimalScale={2} sentiment={sentiment(row.value)} />
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Section>
	{/if}

	{#if !isLoading && account}
		<Section>
			{#if accountCashflow.isLoading}
				<Skeleton class="h-32" />
			{:else}
				<CashflowAverages
					avg3m={accountCashflow.avg3m}
					avg6m={accountCashflow.avg6m}
					avgYtd={accountCashflow.avgYtd}
					avg1y={accountCashflow.avg1y}
				/>
			{/if}
		</Section>
	{/if}

	<Section>
		<SectionTitle title={m.accounts_section_balance()} />
		{#if isLoading || !account}
			<Skeleton class="h-48" />
		{:else}
			<BalanceForm
				{formData}
				balanceAsOf={account?.balanceAsOf ?? ''}
				onSubmit={handleUpdateBalance}
				disabled={!canWrite}
				hasPositions={positionsRows.length > 0}
			/>
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.accounts_section_details()} />
		{#if isLoading || !account}
			<Skeleton class="h-96" />
		{:else}
			<DetailsForm {formData} onSubmit={handleUpdateDetails} disabled={!canWrite} />
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.accounts_section_sharing()} />
		{#if isLoading || !account}
			<Skeleton class="h-40" />
		{:else if canWrite}
			<div class="bg-muted border-border overflow-hidden rounded border">
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
									<Select.Item value={AccountSharesPerspectiveOptions.NORMAL}>Normal</Select.Item>
									<Select.Item value={AccountSharesPerspectiveOptions.INVERSE}>Inverse</Select.Item>
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
							<Button type="submit">Share</Button>
						</div>
					</footer>
				</form>
			</div>
		{:else}
			<div class="bg-muted border-border overflow-hidden rounded border">
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
							<Input id="perspective" value={perspectiveLabel(account.perspective)} disabled />
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
							<Button type="submit">Save</Button>
						</div>
					</footer>
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
