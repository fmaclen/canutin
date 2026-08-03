<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { getAccountsContext } from '$lib/accounts.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Link from '$lib/components/link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
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

	let { connectionId }: { connectionId: string } = $props();

	const accountsContext = getAccountsContext();
	const pb = getPocketBaseContext();

	let connection = $state<PlaidConnectionsResponse | null>(null);
	let isLoading = $state(true);
	let isSyncing = $state(false);
	let isUnlinking = $state(false);

	function fetchConnection(id: string) {
		return pb.authedClient.collection('plaidConnections').getOne<PlaidConnectionsResponse>(id, {
			fields: 'id,institutionName,status,lastSyncedAt',
			requestKey: `accountDetail:connection:${id}`
		});
	}

	function isSyncInProgress(error: unknown) {
		return (
			error instanceof ClientResponseError &&
			error.status === 409 &&
			error.response?.error === 'plaid_sync_in_progress'
		);
	}

	$effect(() => {
		const id = connectionId;
		let cancelled = false;
		connection = null;
		isLoading = true;

		void (async () => {
			try {
				const record = await fetchConnection(id);
				if (!cancelled) connection = record;
			} catch (error) {
				if (!cancelled) pb.handleConnectionError(error, 'accountDetail', 'load_connection');
			} finally {
				if (!cancelled) isLoading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	async function handleSync() {
		const id = connection?.id;
		if (!id || isSyncing || isUnlinking) return;

		isSyncing = true;
		try {
			const result = await pb.authedClient.send<SyncResponse>(
				`/api/canutin/plaid/connections/${id}/sync`,
				{ method: 'POST' }
			);
			const message = m.accounts_connection_sync_success({
				created: result.created,
				skipped: result.skipped,
				failed: result.failed
			});
			if (result.failed > 0) toast.warning(message);
			else toast.success(message);
		} catch (error) {
			if (isSyncInProgress(error)) {
				toast.info(m.accounts_connection_sync_in_progress());
			} else {
				logError('accountDetail', 'sync_connection', error);
				toast.error(m.accounts_connection_sync_failed());
			}
		} finally {
			try {
				const record = await fetchConnection(id);
				if (connectionId === id) connection = record;
			} catch (error) {
				pb.handleConnectionError(error, 'accountDetail', 'refresh_connection');
			}
			isSyncing = false;
		}
	}

	async function handleUnlink() {
		const id = connection?.id;
		if (!id || isSyncing || isUnlinking) return;

		isUnlinking = true;
		try {
			const result = await pb.authedClient.send<{ accounts: number }>(
				`/api/canutin/plaid/connections/${id}`,
				{ method: 'DELETE' }
			);
			connection = null;
			toast.success(
				result.accounts === 1
					? m.accounts_connection_unlink_success_one()
					: m.accounts_connection_unlink_success_other({ count: result.accounts })
			);
			await accountsContext.refreshForCurrentUser();
		} catch (error) {
			if (isSyncInProgress(error)) {
				toast.info(m.accounts_connection_sync_in_progress());
			} else {
				logError('accountDetail', 'unlink_connection', error);
				toast.error(m.accounts_connection_unlink_failed());
			}
		} finally {
			isUnlinking = false;
		}
	}
</script>

{#if isLoading || connection}
	<Section>
		<SectionTitle title={m.accounts_connection_section_title()} />
		{#if isLoading || !connection}
			<Skeleton class="h-48" />
		{:else}
			<div class="border-border overflow-hidden rounded border">
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label class="justify-start pr-0 md:justify-end">
							{m.accounts_connection_institution_label()}
						</Label>
						<p class="text-sm">
							{connection.institutionName || '—'}
						</p>
					</FormFieldRow>

					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2">
							{m.accounts_connection_status_label()}
						</Label>
						{#if connection.status === PlaidConnectionsStatusOptions.error}
							<p class="text-muted-foreground py-2 text-sm">
								{m.accounts_connection_status_error()}
								<Link href={resolve('/settings/imports')}>
									{m.accounts_connection_imports_link()}
								</Link>
							</p>
						{:else if connection.status === PlaidConnectionsStatusOptions.reauth_required}
							<p
								class="border-destructive/30 bg-destructive/5 text-destructive rounded border px-3 py-2 text-sm"
								role="alert"
							>
								{m.accounts_connection_status_reauth_required()}
							</p>
						{:else}
							<p class="py-2 text-sm">{m.accounts_connection_status_ok()}</p>
						{/if}
					</FormFieldRow>

					<FormFieldRow>
						<Label class="justify-start pr-0 md:justify-end">
							{m.accounts_connection_last_synced_label()}
						</Label>
						{#if connection.lastSyncedAt}
							<time datetime={connection.lastSyncedAt} class="text-sm">
								{new Date(connection.lastSyncedAt).toLocaleString(getFormattingLocale(), {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit'
								})}
							</time>
						{:else}
							<p class="text-muted-foreground text-sm">—</p>
						{/if}
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end gap-2">
						<Button onclick={handleSync} disabled={isSyncing || isUnlinking}>
							{#if isSyncing}
								<LoaderCircleIcon class="animate-spin" />
								{m.accounts_connection_syncing_button()}
							{:else}
								{m.accounts_connection_sync_button()}
							{/if}
						</Button>
						<AlertDialog.Root>
							<AlertDialog.Trigger>
								<Button variant="destructive" disabled={isSyncing || isUnlinking}>
									{m.accounts_connection_unlink_button()}
								</Button>
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>
										{m.accounts_connection_unlink_confirm_title()}
									</AlertDialog.Title>
									<AlertDialog.Description>
										{m.accounts_connection_unlink_confirm_description()}
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>
										{m.accounts_connection_unlink_confirm_cancel()}
									</AlertDialog.Cancel>
									<AlertDialog.Action onclick={handleUnlink}>
										{m.accounts_connection_unlink_confirm_continue()}
									</AlertDialog.Action>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</footer>
			</div>
		{/if}
	</Section>
{/if}
