<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import { getImportSessionsContext } from '$lib/import-sessions.svelte';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import type { ImportSessionsResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';
	import {
		createSortComparator,
		getSortFromUrl,
		setSortInUrl,
		toggleSort,
		type SortState
	} from '$lib/utils';

	const importSessionsContext = getImportSessionsContext();
	const pb = getPocketBaseContext();
	const agentAccessUrl = $derived(`${pb.backendUrl}/api/canutin/skill`);

	type SessionRow = Pick<
		ImportSessionsResponse,
		'id' | 'label' | 'status' | 'recordsCreated' | 'recordsSkipped' | 'recordsFailed' | 'created'
	>;

	type SessionSortColumn =
		| 'label'
		| 'recordsCreated'
		| 'recordsSkipped'
		| 'recordsFailed'
		| 'created';
	const validSortColumns: SessionSortColumn[] = [
		'label',
		'recordsCreated',
		'recordsSkipped',
		'recordsFailed',
		'created'
	];

	const defaultSort: SortState<SessionSortColumn> = { column: 'created', direction: 'desc' };
	const sortState = $derived.by(() => {
		const urlSort = getSortFromUrl($page.url);
		if (
			urlSort.column &&
			urlSort.direction &&
			validSortColumns.includes(urlSort.column as SessionSortColumn)
		) {
			return urlSort as SortState<SessionSortColumn>;
		}
		return defaultSort;
	});

	function handleSort(column: string) {
		const newState = toggleSort(sortState, column as SessionSortColumn);
		const newUrl = setSortInUrl($page.url, newState);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		goto(newUrl, { replaceState: true, keepFocus: true });
	}

	const sortedRows = $derived.by(() => {
		const rows: SessionRow[] = importSessionsContext.sessions.map((session) => ({
			id: session.id,
			label: session.label,
			status: session.status,
			recordsCreated: session.recordsCreated,
			recordsSkipped: session.recordsSkipped,
			recordsFailed: session.recordsFailed,
			created: session.created
		}));

		const comparator = createSortComparator<SessionRow, SessionSortColumn>(sortState, {
			label: (r) => r.label,
			recordsCreated: (r) => r.recordsCreated,
			recordsSkipped: (r) => r.recordsSkipped,
			recordsFailed: (r) => r.recordsFailed,
			created: (r) => r.created
		});
		return rows.sort(comparator);
	});

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(getFormattingLocale(), {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	let revertingSessionId: string | null = $state(null);

	async function handleRevert(sessionId: string) {
		revertingSessionId = sessionId;
		try {
			await pb.authedClient.send('/api/canutin/import/revert', {
				method: 'POST',
				body: { sessionId }
			});

			toast.success(m.settings_imports_revert_success());
		} catch (error) {
			logError('settings', 'revert_import', error);
			toast.error(m.settings_imports_revert_failed());
		} finally {
			revertingSessionId = null;
		}
	}
</script>

<Section>
	{#if importSessionsContext.isLoading}
		<Skeleton class="h-64" showSpinner />
	{:else}
		<SectionTitle title={m.settings_imports_section_title()} />

		{#if sortedRows.length === 0}
			<Empty>
				{m.settings_imports_empty()}
			</Empty>
		{:else}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.SortableHead
								class="text-left whitespace-nowrap"
								column="label"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.settings_imports_table_header_label()}
							</Table.SortableHead>
							<Table.Head class="text-left whitespace-nowrap">
								{m.settings_imports_table_header_status()}
							</Table.Head>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="recordsCreated"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.settings_imports_table_header_records()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="recordsSkipped"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.settings_imports_table_header_skipped()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="recordsFailed"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.settings_imports_table_header_failed()}
							</Table.SortableHead>
							<Table.SortableHead
								class="text-right whitespace-nowrap"
								column="created"
								sortColumn={sortState.column}
								sortDirection={sortState.direction}
								onSort={handleSort}
							>
								{m.settings_imports_table_header_created()}
							</Table.SortableHead>
							<Table.Head class="w-0"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each sortedRows as row (row.id)}
							<Table.Row class={row.status === 'rolled_back' ? 'bg-muted/30' : ''}>
								<Table.Cell>
									<span class="text-foreground/90 text-sm font-medium">
										{row.label}
									</span>
								</Table.Cell>
								<Table.Cell>
									{#if row.status === 'completed'}
										<Badge variant="cash">
											{m.settings_imports_status_completed()}
										</Badge>
									{:else if row.status === 'completed_with_errors'}
										<Badge variant="secondary">
											{m.settings_imports_status_completed_with_errors()}
										</Badge>
									{:else if row.status === 'failed'}
										<Badge variant="destructive">
											{m.settings_imports_status_failed()}
										</Badge>
									{:else if row.status === 'pending'}
										<Badge variant="outline">
											{m.settings_imports_status_pending()}
										</Badge>
									{:else}
										<Badge variant="outline">
											{m.settings_imports_status_rolled_back()}
										</Badge>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-right text-sm tabular-nums">
									{row.recordsCreated}
								</Table.Cell>
								<Table.Cell class="text-foreground/80 text-right text-sm tabular-nums">
									{row.recordsSkipped}
								</Table.Cell>
								<Table.Cell
									class="text-right text-sm tabular-nums {row.recordsFailed
										? 'text-destructive font-medium'
										: 'text-foreground/80'}"
								>
									{row.recordsFailed ?? 0}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-right text-sm">
									{formatDate(row.created)}
								</Table.Cell>
								<Table.Cell class="text-right">
									{#if row.status === 'completed' || row.status === 'completed_with_errors'}
										<AlertDialog.Root>
											<AlertDialog.Trigger disabled={revertingSessionId === row.id}>
												<Button
													variant="secondary"
													size="sm"
													disabled={revertingSessionId === row.id}
												>
													{m.settings_imports_revert_button()}
												</Button>
											</AlertDialog.Trigger>
											<AlertDialog.Content>
												<AlertDialog.Header>
													<AlertDialog.Title>
														{m.settings_imports_revert_confirm_title()}
													</AlertDialog.Title>
													<AlertDialog.Description>
														{m.settings_imports_revert_confirm_description()}
													</AlertDialog.Description>
												</AlertDialog.Header>
												<AlertDialog.Footer>
													<AlertDialog.Cancel>
														{m.settings_imports_revert_confirm_cancel()}
													</AlertDialog.Cancel>
													<AlertDialog.Action onclick={() => handleRevert(row.id)}>
														{m.settings_imports_revert_confirm_continue()}
													</AlertDialog.Action>
												</AlertDialog.Footer>
											</AlertDialog.Content>
										</AlertDialog.Root>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	{/if}
</Section>

<Section>
	<SectionTitle title={m.settings_agent_access_section_title()} />
	<div class="border-border overflow-hidden rounded border">
		<Fieldset isFirst={true}>
			<FormFieldRow>
				<Label for="agent-access-url" class="justify-start pr-0 md:justify-end"
					>{m.settings_agent_access_url_label()}</Label
				>
				<Input id="agent-access-url" readonly value={agentAccessUrl} class="bg-background" />
			</FormFieldRow>
		</Fieldset>
	</div>
</Section>
