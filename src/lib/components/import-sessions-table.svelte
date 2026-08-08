<script lang="ts" module>
	import type { ImportSessionsResponse } from '$lib/pocketbase.schema';

	export type ImportSessionTableRow = Pick<
		ImportSessionsResponse,
		'id' | 'label' | 'status' | 'recordsCreated' | 'recordsSkipped' | 'recordsFailed'
	> & { created: string };
</script>

<script lang="ts">
	import ImportSessionStatusBadge from '$lib/components/import-session-status-badge.svelte';
	import TableViewAllRow from '$lib/components/table-view-all-row.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table/index';
	import { getFormattingLocale } from '$lib/interface-preferences.svelte';
	import { m } from '$lib/paraglide/messages';
	import { ImportSessionsStatusOptions } from '$lib/pocketbase.schema';
	import { TableSort } from '$lib/sorting.svelte';
	import { createSortComparator, type SortState } from '$lib/utils';

	type SessionSortColumn =
		| 'label'
		| 'recordsCreated'
		| 'recordsSkipped'
		| 'recordsFailed'
		| 'created';

	let {
		rows,
		revertingSessionId,
		onRevert,
		viewAll
	}: {
		rows: ImportSessionTableRow[];
		revertingSessionId?: string | null;
		onRevert?: (sessionId: string) => void | Promise<void>;
		viewAll?: { href: string; label: string };
	} = $props();

	const validSortColumns: SessionSortColumn[] = [
		'label',
		'recordsCreated',
		'recordsSkipped',
		'recordsFailed',
		'created'
	];
	const defaultSort: SortState<SessionSortColumn> = { column: 'created', direction: 'desc' };
	const sort = new TableSort<SessionSortColumn>(validSortColumns, defaultSort);
	const dateFormatter = new Intl.DateTimeFormat(getFormattingLocale(), {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	const sortedRows = $derived(
		rows.toSorted(
			createSortComparator<ImportSessionTableRow, SessionSortColumn>(sort.state, {
				label: (row) => row.label,
				recordsCreated: (row) => row.recordsCreated,
				recordsSkipped: (row) => row.recordsSkipped,
				recordsFailed: (row) => row.recordsFailed,
				created: (row) => row.created
			})
		)
	);
</script>

<div class="bg-background overflow-hidden rounded-sm shadow-md">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.SortableHead
					class="text-left whitespace-nowrap"
					column="label"
					sortColumn={sort.column}
					sortDirection={sort.direction}
					onSort={sort.toggle}
				>
					{m.settings_imports_table_header_label()}
				</Table.SortableHead>
				<Table.Head class="text-left whitespace-nowrap">
					{m.settings_imports_table_header_status()}
				</Table.Head>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="recordsCreated"
					sortColumn={sort.column}
					sortDirection={sort.direction}
					onSort={sort.toggle}
				>
					{m.settings_imports_table_header_records()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="recordsSkipped"
					sortColumn={sort.column}
					sortDirection={sort.direction}
					onSort={sort.toggle}
				>
					{m.settings_imports_table_header_skipped()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="recordsFailed"
					sortColumn={sort.column}
					sortDirection={sort.direction}
					onSort={sort.toggle}
				>
					{m.settings_imports_table_header_failed()}
				</Table.SortableHead>
				<Table.SortableHead
					class="text-right whitespace-nowrap"
					column="created"
					sortColumn={sort.column}
					sortDirection={sort.direction}
					onSort={sort.toggle}
				>
					{m.settings_imports_table_header_created()}
				</Table.SortableHead>
				{#if onRevert}
					<Table.Head class="w-0"></Table.Head>
				{/if}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each sortedRows as row (row.id)}
				<Table.Row
					class={row.status === ImportSessionsStatusOptions.rolled_back ? 'bg-muted/30' : ''}
				>
					<Table.Cell>
						<span class="text-foreground/90 text-sm font-medium">{row.label}</span>
					</Table.Cell>
					<Table.Cell><ImportSessionStatusBadge status={row.status} /></Table.Cell>
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
						{dateFormatter.format(new Date(row.created))}
					</Table.Cell>
					{#if onRevert}
						<Table.Cell class="text-right">
							{#if row.status === ImportSessionsStatusOptions.completed || row.status === ImportSessionsStatusOptions.completed_with_errors}
								<AlertDialog.Root>
									<AlertDialog.Trigger disabled={revertingSessionId === row.id}>
										<Button variant="secondary" size="sm" disabled={revertingSessionId === row.id}>
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
											<AlertDialog.Action onclick={() => onRevert(row.id)}>
												{m.settings_imports_revert_confirm_continue()}
											</AlertDialog.Action>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							{/if}
						</Table.Cell>
					{/if}
				</Table.Row>
			{/each}
		</Table.Body>
		{#if viewAll}
			<TableViewAllRow href={viewAll.href} label={viewAll.label} colspan={onRevert ? 7 : 6} />
		{/if}
	</Table.Root>
</div>
