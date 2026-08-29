<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import type { Snippet } from 'svelte';

	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import CanutinWordmark from '$lib/components/canutin-wordmark.svelte';
	import GuestBackdrop from '$lib/components/guest-backdrop.svelte';
	import { m } from '$lib/paraglide/messages';

	// Without a body the screen is a loading state; overlays that bring their own spinner (Plaid
	// Link) opt out of ours. The brand header links to `href` when given and is plain branding
	// otherwise. Guest routes already paint the backdrop in their layout, so they opt out of a
	// second one.
	let {
		href,
		backdrop = true,
		spinner = true,
		children
	}: { href?: string; backdrop?: boolean; spinner?: boolean; children?: Snippet } = $props();
</script>

{#snippet brand()}
	<CanutinIcon class="size-5" fill="brand" />
	<CanutinWordmark class="dark:text-foreground h-3.5 w-auto text-stone-700" />
{/snippet}

{#if backdrop}
	<GuestBackdrop />
{/if}
<div class="relative flex min-h-dvh w-full flex-col items-center px-6">
	{#if href}
		<a {href} aria-label={m.app_name()} class="flex items-center gap-2.5 py-8">
			{@render brand()}
		</a>
	{:else}
		<div class="flex items-center gap-2.5 py-8" role="img" aria-label={m.app_name()}>
			{@render brand()}
		</div>
	{/if}
	<div class="flex w-full flex-1 items-center justify-center">
		<div class="mx-auto flex w-full max-w-sm flex-col gap-6">
			{#if children}
				{@render children()}
			{:else if spinner}
				<div class="flex justify-center">
					<LoaderCircleIcon class="text-muted-foreground size-8 animate-spin" />
				</div>
			{/if}
		</div>
	</div>
</div>
