<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { m } from '$lib/paraglide/messages';
	import type { SetupStatus } from '$lib/pocketbase.svelte';

	let { status, backendUrl }: { status: SetupStatus; backendUrl: string } = $props();
</script>

<div class="flex h-screen w-full flex-col items-center px-4">
	<a href="https://canutin.com" class="bg-brand px-3 pt-6 pb-3">
		<CanutinIcon class="size-6 text-white" />
	</a>
	<div class="flex w-full flex-1 items-center justify-center">
		<Card.Root class="mx-auto w-full max-w-sm">
			{#if status === 'needs-setup'}
				<Card.Header>
					<Card.Title class="text-2xl">{m.setup_title()}</Card.Title>
					<Card.Description>{m.setup_description()}</Card.Description>
				</Card.Header>
			{:else if status === 'unreachable'}
				<Card.Header>
					<Card.Title class="text-2xl">{m.setup_unreachable_title()}</Card.Title>
					<Card.Description>{m.setup_unreachable_description()}</Card.Description>
				</Card.Header>
				<Card.Content>
					<div
						class="border-border flex items-center justify-between rounded-sm border bg-transparent px-4 py-3.5"
					>
						<div class="text-sm font-semibold tracking-tight">{m.setup_unreachable_server()}</div>
						<div class="font-mono text-lg">{backendUrl}</div>
					</div>
				</Card.Content>
			{:else}
				<Card.Header>
					<Card.Title class="text-2xl">{m.app_name()}</Card.Title>
					<Card.Description>{m.app_tagline()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex justify-center py-4">
					<LoaderCircleIcon class="text-muted-foreground size-8 animate-spin" />
				</Card.Content>
			{/if}
		</Card.Root>
	</div>
</div>
