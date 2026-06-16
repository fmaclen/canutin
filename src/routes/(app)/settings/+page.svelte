<script lang="ts">
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import Page from '$lib/components/page.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import * as Table from '$lib/components/ui/table/index';
	import { getImportSessionsContext } from '$lib/import-sessions.svelte';
	import {
		interfacePreferences,
		setInterfaceLocale,
		type InterfaceThemeMode
	} from '$lib/interface-preferences.svelte';
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

	let themeDraft = $state<InterfaceThemeMode>(userPrefersMode.current);
	let localeDraft = $state<'en' | 'es'>(interfacePreferences.locale);

	const currentTheme = $derived(userPrefersMode.current);
	const currentLocale = $derived(interfacePreferences.locale);
	const interfaceIsDirty = $derived(themeDraft !== currentTheme || localeDraft !== currentLocale);

	type SessionRow = Pick<
		ImportSessionsResponse,
		'id' | 'label' | 'status' | 'recordsCreated' | 'recordsSkipped' | 'created'
	>;

	type SessionSortColumn = 'label' | 'recordsCreated' | 'recordsSkipped' | 'created';
	const validSortColumns: SessionSortColumn[] = [
		'label',
		'recordsCreated',
		'recordsSkipped',
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
			created: session.created
		}));

		const comparator = createSortComparator<SessionRow, SessionSortColumn>(sortState, {
			label: (r) => r.label,
			recordsCreated: (r) => r.recordsCreated,
			recordsSkipped: (r) => r.recordsSkipped,
			created: (r) => r.created
		});
		return rows.sort(comparator);
	});

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleThemeDraftChange(value: string) {
		if (value !== 'system' && value !== 'light' && value !== 'dark') {
			return;
		}
		themeDraft = value;
	}

	function handleLocaleDraftChange(value: string) {
		if (value !== 'en' && value !== 'es') {
			return;
		}
		localeDraft = value;
	}

	async function handleInterfaceSubmit() {
		if (!interfaceIsDirty) return;

		try {
			if (themeDraft !== currentTheme) {
				setMode(themeDraft);
			}
			if (localeDraft !== currentLocale) {
				await setInterfaceLocale(localeDraft);
			}
			toast.success(m.settings_interface_success());
		} catch (error) {
			console.error('[settings] Failed to update interface preferences:', error);
			toast.error(m.settings_interface_language_failed());
		}
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
			console.error('Failed to revert import:', error);
			toast.error(m.settings_imports_revert_failed());
		} finally {
			revertingSessionId = null;
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
					<Breadcrumb.Page>{m.user_settings()}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>

<Page pageTitle={m.settings_page_title()}>
	<Section>
		<SectionTitle title={m.settings_interface_section_title()} />
		<div class="bg-muted border-border overflow-hidden rounded border">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleInterfaceSubmit();
				}}
				class="space-y-0"
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label id="theme-label" for="theme" class="justify-start pr-0 md:justify-end"
							>{m.settings_interface_theme_label()}</Label
						>
						<Select.Root type="single" value={themeDraft} onValueChange={handleThemeDraftChange}>
							<Select.Trigger id="theme" aria-labelledby="theme-label" class="bg-background w-full">
								{#if themeDraft === 'light'}
									{m.settings_interface_theme_light_option()}
								{:else if themeDraft === 'dark'}
									{m.settings_interface_theme_dark_option()}
								{:else}
									{m.settings_interface_theme_system_option()}
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="system">
									{m.settings_interface_theme_system_option()}
								</Select.Item>
								<Select.Item value="light">
									{m.settings_interface_theme_light_option()}
								</Select.Item>
								<Select.Item value="dark">
									{m.settings_interface_theme_dark_option()}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>

					<FormFieldRow>
						<Label id="language-label" for="language" class="justify-start pr-0 md:justify-end"
							>{m.settings_interface_language_label()}</Label
						>
						<Select.Root type="single" value={localeDraft} onValueChange={handleLocaleDraftChange}>
							<Select.Trigger
								id="language"
								aria-labelledby="language-label"
								class="bg-background w-full"
							>
								{localeDraft === 'es' ? 'Español' : 'English'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="en">English</Select.Item>
								<Select.Item value="es">Español</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit" disabled={!interfaceIsDirty}
							>{m.settings_interface_button_save()}</Button
						>
					</div>
				</footer>
			</form>
		</div>
	</Section>

	<Section>
		{#if importSessionsContext.isLoading}
			<div class="bg-background overflow-hidden rounded-sm shadow-md">
				<Skeleton class="h-64" showSpinner />
			</div>
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
									<Table.Cell class="text-muted-foreground text-right text-sm">
										{formatDate(row.created)}
									</Table.Cell>
									<Table.Cell class="text-right">
										{#if row.status === 'completed'}
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
</Page>
