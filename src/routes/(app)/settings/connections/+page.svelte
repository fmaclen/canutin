<script lang="ts">
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { getAccountsContext } from '$lib/accounts.svelte';
	import Currency from '$lib/components/currency.svelte';
	import Empty from '$lib/components/empty.svelte';
	import RecordLink from '$lib/components/record-link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import type { BadgeVariant } from '$lib/components/ui/badge/badge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Table from '$lib/components/ui/table/index';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import {
		PlaidConnectionsStatusOptions,
		type PlaidConnectionsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	type SyncResponse = {
		created: number;
		skipped: number;
		failed: number;
	};

	const statusVariants: Record<PlaidConnectionsStatusOptions, BadgeVariant> = {
		[PlaidConnectionsStatusOptions.ok]: 'positive',
		[PlaidConnectionsStatusOptions.error]: 'negative',
		[PlaidConnectionsStatusOptions.reauth_required]: 'warning'
	};

	const statusLabels: Record<PlaidConnectionsStatusOptions, () => string> = {
		[PlaidConnectionsStatusOptions.ok]: m.settings_connections_status_ok,
		[PlaidConnectionsStatusOptions.error]: m.settings_connections_status_error,
		[PlaidConnectionsStatusOptions.reauth_required]: m.settings_connections_status_reauth_required
	};

	const pb = getPocketBaseContext();
	const accountsContext = getAccountsContext();

	const dateTimeFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	// The `plaidSync` cron runs at 06:00 UTC every day, so the next run is today's slot when it
	// hasn't passed yet and tomorrow's otherwise.
	const now = new Date();
	const nextAutoSyncAt = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() + (now.getUTCHours() < 6 ? 0 : 1),
			6
		)
	);

	let connections: PlaidConnectionsResponse[] = $state([]);
	let isLoadingConnections = $state(true);
	let notConfigured = $state(false);
	let syncingConnectionId: string | null = $state(null);
	let unlinkingConnectionId: string | null = $state(null);

	const isLoading = $derived(isLoadingConnections || accountsContext.isLoading);

	$effect(() => {
		void loadConnections();
	});

	async function loadConnections() {
		try {
			connections = await pb.authedClient
				.collection('plaidConnections')
				.getFullList<PlaidConnectionsResponse>({
					fields: 'id,institutionName,status,lastSyncedAt',
					sort: 'institutionName',
					requestKey: 'settingsConnections:list'
				});

			// Probing only when there is nothing to list tells "no banks linked yet" apart from "this
			// server has no Plaid credentials", without a Plaid round-trip for everyone else.
			if (connections.length === 0) {
				try {
					await pb.authedClient.send('/api/canutin/plaid/link-token', { method: 'POST' });
				} catch (error) {
					notConfigured =
						error instanceof ClientResponseError &&
						error.status === 503 &&
						error.response?.error === 'plaid_not_configured';
					if (!notConfigured) logError('settingsConnections', 'link_token_probe', error);
				}
			}
		} catch (error) {
			pb.handleConnectionError(error, 'settingsConnections', 'load_connections');
		} finally {
			isLoadingConnections = false;
		}
	}

	async function handleSync(connectionId: string) {
		if (syncingConnectionId) return;
		syncingConnectionId = connectionId;

		try {
			const result = await pb.authedClient.send<SyncResponse>(
				`/api/canutin/plaid/connections/${connectionId}/sync`,
				{ method: 'POST' }
			);

			if (result.failed > 0) {
				toast.warning(
					m.settings_connections_sync_partial({
						created: result.created,
						skipped: result.skipped,
						failed: result.failed
					})
				);
			} else {
				toast.success(
					m.settings_connections_sync_success({
						created: result.created,
						skipped: result.skipped
					})
				);
			}

			await loadConnections();
		} catch (error) {
			if (
				error instanceof ClientResponseError &&
				error.status === 409 &&
				error.response?.error === 'plaid_sync_in_progress'
			) {
				toast.info(m.settings_connections_sync_in_progress());
			} else {
				logError('settingsConnections', 'sync_connection', error);
				toast.error(m.settings_connections_sync_failed());
			}
		} finally {
			syncingConnectionId = null;
		}
	}

	async function handleUnlink(connectionId: string) {
		if (unlinkingConnectionId) return;
		unlinkingConnectionId = connectionId;

		try {
			const { accounts } = await pb.authedClient.send<{ accounts: number }>(
				`/api/canutin/plaid/connections/${connectionId}`,
				{ method: 'DELETE' }
			);
			connections = connections.filter((connection) => connection.id !== connectionId);
			toast.success(
				accounts === 1
					? m.settings_connections_unlink_success_one()
					: m.settings_connections_unlink_success_other({ count: accounts })
			);
		} catch (error) {
			logError('settingsConnections', 'unlink_connection', error);
			toast.error(m.settings_connections_unlink_failed());
		} finally {
			unlinkingConnectionId = null;
		}
	}
</script>

<Section>
	<SectionTitle title={m.settings_connections_section_title()} />
	{#if isLoading}
		<Skeleton class="h-64" showSpinner />
	{:else if notConfigured}
		<Empty>
			{m.accounts_link_unavailable()}
		</Empty>
	{:else if connections.length === 0}
		<Empty>
			{m.settings_connections_empty()}
		</Empty>
	{:else}
		<div class="bg-background overflow-hidden rounded-sm shadow-md">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="text-left whitespace-nowrap">
							{m.settings_connections_table_header_institution()}
						</Table.Head>
						<Table.Head class="text-left whitespace-nowrap">
							{m.settings_connections_table_header_status()}
						</Table.Head>
						<Table.Head class="text-left whitespace-nowrap">
							{m.settings_connections_table_header_last_synced()}
						</Table.Head>
						<Table.Head class="text-left whitespace-nowrap">
							{m.settings_connections_table_header_next_sync()}
						</Table.Head>
						<Table.Head class="text-right whitespace-nowrap">
							{m.settings_connections_table_header_accounts()}
						</Table.Head>
						<Table.Head class="w-0"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each connections as connection (connection.id)}
						{@const linkedAccounts = accountsContext.accounts.filter(
							(account) => account.connection === connection.id
						)}
						{@const isBusy =
							syncingConnectionId === connection.id || unlinkingConnectionId === connection.id}
						<Table.Row>
							<Table.Cell>
								<span class="text-foreground/90 text-sm font-medium">
									{connection.institutionName || m.settings_connections_unnamed_institution()}
								</span>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={statusVariants[connection.status]}>
									{statusLabels[connection.status]()}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm whitespace-nowrap">
								{#if connection.lastSyncedAt}
									{dateTimeFormatter.format(new Date(connection.lastSyncedAt))}
								{:else}
									<span class="text-muted-foreground">~</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm whitespace-nowrap">
								{#if connection.status === PlaidConnectionsStatusOptions.reauth_required}
									<span class="text-muted-foreground">~</span>
								{:else}
									{dateTimeFormatter.format(nextAutoSyncAt)}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-foreground/80 text-right text-sm tabular-nums">
								{linkedAccounts.length}
							</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex items-center justify-end gap-2">
									<Button
										variant="secondary"
										size="sm"
										disabled={isBusy ||
											connection.status === PlaidConnectionsStatusOptions.reauth_required}
										onclick={() => handleSync(connection.id)}
									>
										{syncingConnectionId === connection.id
											? m.settings_connections_sync_button_pending()
											: m.settings_connections_sync_button()}
									</Button>
									<AlertDialog.Root>
										<AlertDialog.Trigger disabled={isBusy}>
											<Button variant="secondary" size="sm" disabled={isBusy}>
												{m.settings_connections_unlink_button()}
											</Button>
										</AlertDialog.Trigger>
										<AlertDialog.Content>
											<AlertDialog.Header>
												<AlertDialog.Title>
													{m.settings_connections_unlink_confirm_title({
														institution:
															connection.institutionName ||
															m.settings_connections_unnamed_institution()
													})}
												</AlertDialog.Title>
												<AlertDialog.Description>
													{m.settings_connections_unlink_confirm_description()}
												</AlertDialog.Description>
											</AlertDialog.Header>
											{#if linkedAccounts.length > 0}
												<div class="border-border overflow-hidden rounded border">
													<ul class="max-h-[50vh] overflow-y-auto">
														{#each linkedAccounts as account (account.id)}
															<li
																class="odd:bg-sidebar flex items-center justify-between gap-2 border-b border-dashed px-4 py-3 text-balance last:border-b-0"
															>
																<RecordLink
																	type="account"
																	id={account.id}
																	name={account.name}
																	isShared={account.isShared}
																	class="text-foreground/90 text-sm"
																/>
																<span class="font-mono tabular-nums">
																	{#if account.displayBalance === null}
																		<span class="text-muted-foreground">~</span>
																	{:else}
																		<Currency
																			value={account.displayBalance}
																			isConverted={account.isConverted}
																			isUnconverted={account.isUnconverted}
																			missingCurrency={account.missingCurrency}
																			nativeCurrency={account.currency}
																			nativeValue={account.balance ?? undefined}
																		/>
																	{/if}
																</span>
															</li>
														{/each}
													</ul>
												</div>
											{/if}
											<AlertDialog.Footer>
												<AlertDialog.Cancel>
													{m.settings_connections_unlink_confirm_cancel()}
												</AlertDialog.Cancel>
												<AlertDialog.Action onclick={() => handleUnlink(connection.id)}>
													{m.settings_connections_unlink_confirm_continue()}
												</AlertDialog.Action>
											</AlertDialog.Footer>
										</AlertDialog.Content>
									</AlertDialog.Root>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</Section>
