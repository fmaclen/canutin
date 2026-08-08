<script lang="ts">
	import { toast } from 'svelte-sonner';

	import Empty from '$lib/components/empty.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import ImportSessionsTable from '$lib/components/import-sessions-table.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index';
	import { getImportSessionsContext } from '$lib/import-sessions.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const importSessionsContext = getImportSessionsContext();
	const pb = getPocketBaseContext();
	const agentAccessUrl = $derived(`${pb.backendUrl}/api/canutin/skill`);

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
	<SectionTitle title={m.settings_imports_section_title()} />
	{#if importSessionsContext.isLoading}
		<Skeleton class="h-64" showSpinner />
	{:else if importSessionsContext.sessions.length === 0}
		<Empty>
			{m.settings_imports_empty()}
		</Empty>
	{:else}
		<ImportSessionsTable
			rows={importSessionsContext.sessions}
			{revertingSessionId}
			onRevert={handleRevert}
		/>
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
