<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import CanutinWordmark from '$lib/components/canutin-wordmark.svelte';
	import GuestBackdrop from '$lib/components/guest-backdrop.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SetupStatus } from '$lib/pocketbase.svelte';

	let { status, backendUrl }: { status: SetupStatus; backendUrl: string } = $props();
</script>

<GuestBackdrop />
<div class="relative flex min-h-dvh w-full flex-col items-center px-6">
	<a href="https://canutin.com" aria-label={m.app_name()} class="flex items-center gap-2.5 py-8">
		<CanutinIcon class="size-5" fill="brand" />
		<CanutinWordmark class="dark:text-foreground h-3.5 w-auto text-stone-700" />
	</a>
	<div class="flex w-full flex-1 items-center justify-center">
		<div class="mx-auto flex w-full max-w-sm flex-col gap-6">
			{#if status === 'needs-setup'}
				<div class="flex flex-col gap-1.5 text-center">
					<h1 class="text-2xl leading-none font-semibold">{m.setup_title()}</h1>
					<p class="text-muted-foreground text-sm">{m.setup_description()}</p>
				</div>
			{:else if status === 'unreachable'}
				<div class="flex flex-col gap-1.5 text-center">
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
				<div class="flex justify-center">
					<LoaderCircleIcon class="text-muted-foreground size-8 animate-spin" />
				</div>
			{/if}
		</div>
	</div>
</div>
