<script lang="ts">
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import ServerIcon from '@lucide/svelte/icons/server';

	import Link from '$lib/components/link.svelte';
	import SplashScreen from '$lib/components/splash-screen.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SetupStatus } from '$lib/pocketbase.svelte';

	let { status, backendUrl }: { status: SetupStatus; backendUrl: string } = $props();
</script>

{#snippet serverRow()}
	<!-- One tappable row that never wraps: an address too long for the screen is cut short, and the
	     full URL stays in the tooltip -->
	<Link
		href="{backendUrl}/_/"
		target="_blank"
		rel="noreferrer"
		title={backendUrl}
		class="border-border text-muted-foreground hover:text-foreground flex items-center gap-3 rounded-sm border px-4 py-3.5 leading-normal no-underline"
	>
		<ServerIcon class="size-4 shrink-0" />
		<span class="sr-only">{m.setup_server()}</span>
		<span class="text-foreground min-w-0 flex-1 truncate font-mono text-sm"
			>{backendUrl.replace(/^https?:\/\//, '')}</span
		>
		<ArrowUpRightIcon class="size-4 shrink-0" />
	</Link>
{/snippet}

{#if status === 'needs-setup'}
	<SplashScreen href="https://canutin.com">
		<div class="flex flex-col gap-1.5 text-center">
			<h1 class="text-2xl leading-none font-semibold">{m.setup_title()}</h1>
			<p class="text-muted-foreground text-sm">{m.setup_description()}</p>
		</div>
		{@render serverRow()}
	</SplashScreen>
{:else if status === 'unreachable'}
	<SplashScreen href="https://canutin.com">
		<div class="flex flex-col gap-1.5 text-center">
			<h1 class="text-2xl leading-none font-semibold">{m.setup_unreachable_title()}</h1>
			<p class="text-muted-foreground text-sm">{m.setup_unreachable_description()}</p>
		</div>
		{@render serverRow()}
	</SplashScreen>
{:else}
	<SplashScreen href="https://canutin.com" />
{/if}
