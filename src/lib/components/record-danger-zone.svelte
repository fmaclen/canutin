<script lang="ts">
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';

	type DangerAction = {
		description: string;
		subtext: string;
		buttonLabel: string;
		confirmTitle: string;
		confirmDescription: string;
		confirmCancelLabel: string;
		confirmContinueLabel: string;
		onConfirm: () => void | Promise<void>;
	};

	interface Props {
		isLoading: boolean;
		action: DangerAction;
	}

	let { isLoading, action }: Props = $props();
</script>

<Section>
	<SectionTitle title={m.danger_zone_title()} />
	{#if isLoading}
		<Skeleton class="h-24" />
	{:else}
		<div
			class="bg-muted border-border overflow-hidden rounded border md:grayscale md:hover:grayscale-0"
		>
			<div class="flex items-center justify-between p-4">
				<div>
					<p class="text-sm">{action.description}</p>
					<p class="text-destructive text-sm">{action.subtext}</p>
				</div>
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="destructive">{action.buttonLabel}</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{action.confirmTitle}</AlertDialog.Title>
							<AlertDialog.Description>{action.confirmDescription}</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{action.confirmCancelLabel}</AlertDialog.Cancel>
							<AlertDialog.Action onclick={action.onConfirm}>
								{action.confirmContinueLabel}
							</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</div>
		</div>
	{/if}
</Section>
