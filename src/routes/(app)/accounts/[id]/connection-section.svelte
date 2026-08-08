<script lang="ts">
	import { resolve } from '$app/paths';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Link from '$lib/components/link.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		PlaidConnectionsStatusOptions,
		type PlaidConnectionsResponse
	} from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	let { connectionId }: { connectionId: string } = $props();

	const pb = getPocketBaseContext();

	const dateTimeFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	let connection = $state<PlaidConnectionsResponse | null>(null);
	let isLoading = $state(true);

	$effect(() => {
		const id = connectionId;
		let cancelled = false;
		connection = null;
		isLoading = true;

		void (async () => {
			try {
				const record = await pb.authedClient
					.collection('plaidConnections')
					.getOne<PlaidConnectionsResponse>(id, {
						fields: 'id,institutionName,status,lastSyncedAt',
						requestKey: `accountDetail:connection:${id}`
					});
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

	// A healthy connection needs no status row - seeing this section at all means it is connected.
	const statusLabel = $derived(
		connection?.status === PlaidConnectionsStatusOptions.error
			? m.accounts_connection_status_error()
			: connection?.status === PlaidConnectionsStatusOptions.reauth_required
				? m.accounts_connection_status_reauth_required()
				: null
	);

	// The `plaidSync` cron runs at 06:00 UTC every day, so the next run is today's 06:00 UTC while it
	// is still ahead of us and tomorrow's once it has passed. Connections that need re-authentication
	// are skipped by the job until they are linked again.
	const nextScheduledSync = $derived.by(() => {
		if (connection?.status === PlaidConnectionsStatusOptions.reauth_required) return null;
		const now = new Date();
		const daysAhead = now.getUTCHours() >= 6 ? 1 : 0;
		return new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, 6)
		);
	});
</script>

{#if isLoading || connection}
	<Section>
		<SectionTitle title={m.accounts_connection_section_title()}>
			<Link href={resolve('/settings/connections')} class="text-sm">
				{m.accounts_connection_manage_link()}
			</Link>
		</SectionTitle>
		{#if isLoading || !connection}
			<Skeleton class="h-48" />
		{:else}
			<div class="border-border overflow-hidden rounded border">
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="connection-institution" class="justify-start pr-0 md:justify-end">
							{m.accounts_connection_institution_label()}
						</Label>
						<Input
							id="connection-institution"
							value={connection.institutionName || '~'}
							class={connection.institutionName ? undefined : 'text-muted-foreground'}
							disabled
						/>
					</FormFieldRow>

					{#if statusLabel}
						<FormFieldRow>
							<Label for="connection-status" class="justify-start pr-0 md:justify-end">
								{m.accounts_connection_status_label()}
							</Label>
							<Input id="connection-status" value={statusLabel} disabled />
						</FormFieldRow>
					{/if}

					<FormFieldRow>
						<Label for="connection-last-synced" class="justify-start pr-0 md:justify-end">
							{m.accounts_connection_last_synced_label()}
						</Label>
						<Input
							id="connection-last-synced"
							value={connection.lastSyncedAt
								? dateTimeFormatter.format(new Date(connection.lastSyncedAt))
								: '~'}
							class={connection.lastSyncedAt ? undefined : 'text-muted-foreground'}
							disabled
						/>
					</FormFieldRow>

					<FormFieldRow>
						<Label for="connection-next-sync" class="justify-start pr-0 md:justify-end">
							{m.accounts_connection_next_sync_label()}
						</Label>
						<Input
							id="connection-next-sync"
							value={nextScheduledSync
								? dateTimeFormatter.format(nextScheduledSync)
								: m.accounts_connection_next_sync_paused()}
							disabled
						/>
					</FormFieldRow>
				</Fieldset>
			</div>
		{/if}
	</Section>
{/if}
