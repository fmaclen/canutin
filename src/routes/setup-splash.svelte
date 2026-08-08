<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import GuestBackdrop from '$lib/components/guest-backdrop.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SetupStatus } from '$lib/pocketbase.svelte';

	let { status, backendUrl }: { status: SetupStatus; backendUrl: string } = $props();
</script>

<GuestBackdrop />
<div class="relative flex h-screen w-full flex-col items-center px-4">
	<a href="https://canutin.com" class="bg-brand px-3 pt-6 pb-3">
		<CanutinIcon class="size-6 text-white" />
	</a>
	<div class="flex w-full flex-1 items-center justify-center">
		<div class="mx-auto flex w-full max-w-sm flex-col gap-6">
			{#if status === 'needs-setup'}
				<div class="flex flex-col gap-1.5">
					<h1 class="text-2xl leading-none font-semibold">{m.setup_title()}</h1>
					<p class="text-muted-foreground text-sm">{m.setup_description()}</p>
				</div>
			{:else if status === 'unreachable'}
				<div class="flex flex-col gap-1.5">
					<h1 class="text-2xl leading-none font-semibold">{m.setup_unreachable_title()}</h1>
					<p class="text-muted-foreground text-sm">{m.setup_unreachable_description()}</p>
				</div>
				<div
					class="border-border flex items-center justify-between rounded-sm border bg-transparent px-4 py-3.5"
				>
					<div class="text-sm font-semibold tracking-tight">{m.setup_unreachable_server()}</div>
					<div class="font-mono text-lg">{backendUrl}</div>
				</div>
			{:else}
				<div class="flex flex-col gap-1.5">
					<h1 class="text-2xl leading-none font-semibold">{m.app_name()}</h1>
					<p class="text-muted-foreground text-sm">{m.app_tagline()}</p>
				</div>
				<div class="flex justify-center py-4">
					<LoaderCircleIcon class="text-muted-foreground size-8 animate-spin" />
				</div>
			{/if}
		</div>
	</div>
</div>
