<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { format } from 'date-fns';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import { getAuthContext } from '$lib/auth.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import Link from '$lib/components/link.svelte';
	import NumberDisplay from '$lib/components/number.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { m } from '$lib/paraglide/messages';
	import { getSecuritiesContext } from '$lib/securities.svelte';
	import { formatSecurityQuantity } from '$lib/security-transaction-display';

	import BalanceFields from '../balance-fields.svelte';
	import { createSecurityBalanceFormData, toSecurityBalanceInput } from '../balance-form';
	import DetailsForm from './details-form.svelte';

	const auth = getAuthContext();
	const accountsContext = getAccountsContext();
	const securitiesContext = getSecuritiesContext();

	const ownerId = $derived(auth.currentUser?.record?.id);
	const securityId = $derived(page.params.id);
	const security = $derived(securityId ? securitiesContext.getSecurity(securityId) : null);
	const accountBalances = $derived(
		securityId ? securitiesContext.getAccountBalances(securityId) : []
	);
	const summary = $derived(securityId ? securitiesContext.getSummary(securityId) : null);

	let formData = $state({
		name: '',
		symbol: ''
	});
	let balanceFormData = $state(createSecurityBalanceFormData());
	let isSavingBalance = $state(false);

	let syncState = $state({
		lastSyncedVersion: '',
		initialized: false,
		justSaved: false
	});
	const eligibleAccounts = $derived(
		accountsContext.accounts.filter((account) => !account.closed && account.canWrite)
	);

	function formatDate(value: string) {
		return format(new Date(value), 'MMM d, yyyy');
	}

	function sentiment(value: number | null) {
		if (value === null || value === 0) return 'neutral';
		return value > 0 ? 'positive' : 'negative';
	}

	function securityVersion() {
		if (!security) return '';
		return `${security.updated || security.created}_${security.name}_${security.symbol}`;
	}

	function syncForm() {
		if (!security) return;
		formData = {
			name: security.name,
			symbol: security.symbol ?? ''
		};
		syncState.lastSyncedVersion = securityVersion();
		syncState.initialized = true;
	}

	$effect(() => {
		if (!security) {
			if (!securitiesContext.isLoading && securityId) {
				error(404, m.securities_error_not_found());
			}
			return;
		}

		const currentVersion = securityVersion();
		if (!syncState.initialized) {
			syncForm();
			return;
		}

		if (syncState.lastSyncedVersion === currentVersion) return;
		if (syncState.justSaved) {
			syncState.lastSyncedVersion = currentVersion;
			syncState.justSaved = false;
			return;
		}
		syncForm();
	});

	async function handleUpdateDetails() {
		if (!securityId) return;
		const securityName = formData.name.trim();
		if (!securityName) {
			toast.error(m.securities_name_required());
			return;
		}

		try {
			syncState.justSaved = true;
			await securitiesContext.updateSecurity(securityId, {
				name: securityName,
				symbol: formData.symbol.trim()
			});
			toast.success(m.securities_edit_success());
		} catch (error) {
			console.error('[securityDetail]', error);
			syncState.justSaved = false;
			toast.error(m.securities_edit_failed());
		}
	}

	async function handleAddBalance() {
		const currentSecurityId = securityId;
		const currentOwnerId = ownerId;
		if (!currentSecurityId || !currentOwnerId || isSavingBalance) return;
		if (!balanceFormData.accountId) {
			toast.error(m.account_required());
			return;
		}

		try {
			isSavingBalance = true;
			await securitiesContext.addSecurityBalance(
				currentSecurityId,
				toSecurityBalanceInput(balanceFormData, currentOwnerId)
			);
			balanceFormData = createSecurityBalanceFormData();
			toast.success(m.securities_balance_updated());
		} catch (error) {
			console.error('[securityDetail]', error);
			toast.error(m.securities_balance_failed());
		} finally {
			isSavingBalance = false;
		}
	}
</script>

<header class="bg-background flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
	<div class="flex items-center gap-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve('/trades/securities')}
						>{m.securities_title()}</Breadcrumb.Link
					>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if securitiesContext.isLoading || !security}
						<Skeleton class="h-4 w-32" />
					{:else}
						<Breadcrumb.Page>{security.name}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	<nav class="flex items-center gap-4 px-4">
		{#if security}
			<Link href={`${resolve('/trades')}?security=${security.id}`} class="text-sm">
				{m.trades_title()}
			</Link>
		{/if}
	</nav>
</header>

<Page pageTitle={m.securities_edit_page_title()}>
	<Section>
		<SectionTitle title={m.securities_section_details()} />
		{#if securitiesContext.isLoading || !security}
			<Skeleton class="h-36" />
		{:else}
			<DetailsForm {formData} onSubmit={handleUpdateDetails} />
		{/if}
	</Section>

	<Section>
		<SectionTitle title={m.securities_section_balances()} />
		{#if securitiesContext.isLoading}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64" />
			</div>
		{:else}
			<div class="mb-4">
				<div class="bg-muted border-border overflow-hidden rounded border">
					<form
						onsubmit={(event) => {
							event.preventDefault();
							handleAddBalance();
						}}
						class="space-y-0"
					>
						<BalanceFields
							formData={balanceFormData}
							accounts={eligibleAccounts}
							isFirst={true}
							disabled={isSavingBalance}
						/>

						<footer class="border-border bg-border border-t p-2">
							<div class="flex justify-end">
								<Button type="submit" disabled={isSavingBalance}>
									{m.securities_button_add_balance()}
								</Button>
							</div>
						</footer>
					</form>
				</div>
			</div>
			{#if accountBalances.length === 0}
				<Empty>{m.securities_balances_empty()}</Empty>
			{:else}
				<div class="bg-background overflow-hidden rounded-sm shadow-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="text-left whitespace-nowrap">
									{m.securities_table_header_account()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.securities_table_header_quantity()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.securities_table_header_price()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.securities_table_header_value()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.securities_table_header_cost_basis()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.securities_table_header_gain_loss()}
								</Table.Head>
								<Table.Head class="text-right whitespace-nowrap">
									{m.securities_table_header_as_of()}
								</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each accountBalances as row (row.id)}
								<Table.Row>
									<Table.Cell class="text-foreground/90 text-sm font-medium">
										{row.accountName}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.quantity === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<NumberDisplay
												value={formatSecurityQuantity(row.quantity)}
												sentiment="neutral"
											/>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.price === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency value={row.price} decimalScale={2} sentiment="neutral" />
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.value === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency value={row.value} decimalScale={2} sentiment="neutral" />
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{#if row.costBasis === null}
											<span class="text-muted-foreground">~</span>
										{:else}
											<Currency value={row.costBasis} decimalScale={2} sentiment="neutral" />
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
									<Table.Cell class="text-muted-foreground text-right text-sm whitespace-nowrap">
										{formatDate(row.asOf)}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
						<Table.Footer>
							<Table.Row class="border-t-2">
								<Table.Cell class="text-muted-foreground text-xs font-normal">
									{m.securities_total_label()}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									<NumberDisplay
										value={formatSecurityQuantity(summary?.quantity ?? 0)}
										sentiment="neutral"
									/>
								</Table.Cell>
								<Table.Cell></Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if summary?.value === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency value={summary?.value ?? 0} decimalScale={2} sentiment="neutral" />
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if summary?.costBasis === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency
											value={summary?.costBasis ?? 0}
											decimalScale={2}
											sentiment="neutral"
										/>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if summary?.gainLoss === null}
										<span class="text-muted-foreground">~</span>
									{:else}
										<Currency
											value={summary?.gainLoss ?? 0}
											decimalScale={2}
											sentiment={sentiment(summary?.gainLoss ?? null)}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell></Table.Cell>
							</Table.Row>
						</Table.Footer>
					</Table.Root>
				</div>
			{/if}
		{/if}
	</Section>
</Page>
