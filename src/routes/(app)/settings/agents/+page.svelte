<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { toast } from 'svelte-sonner';

	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();
	const agentAccessUrl = $derived(`${pb.backendUrl}/api/canutin/skill`);

	let copied = $state(false);

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(agentAccessUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (error) {
			// The clipboard API only exists in secure contexts, so a server reached over plain HTTP
			// from another machine lands here; the field stays selectable for copying by hand
			logError('settings', 'copy_agent_access_url', error);
			toast.error(m.ui_copy_failed());
		}
	}
</script>

<Section>
	<SectionTitle title={m.settings_agent_access_api_title()} />
	<div class="full-bleed border-border overflow-hidden rounded border">
		<Fieldset isFirst={true}>
			<FormFieldRow>
				<Label for="agent-access-url" class="justify-start pr-0 md:justify-end"
					>{m.settings_agent_access_url_label()}</Label
				>
				<div class="relative">
					<Input id="agent-access-url" readonly value={agentAccessUrl} class="pr-9" />
					<button
						type="button"
						onclick={copyUrl}
						aria-label={copied ? m.ui_copied() : m.ui_copy()}
						class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 flex -translate-y-1/2 cursor-pointer items-center"
					>
						{#if copied}
							<CheckIcon class="size-4" />
						{:else}
							<CopyIcon class="size-4" />
						{/if}
					</button>
				</div>
			</FormFieldRow>
		</Fieldset>
	</div>
</Section>
