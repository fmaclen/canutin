<script lang="ts">
	import Link from '$lib/components/link.svelte';
	import SplashScreen from '$lib/components/splash-screen.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SetupStatus } from '$lib/pocketbase.svelte';

	let { status, backendUrl }: { status: SetupStatus; backendUrl: string } = $props();
</script>

{#snippet serverRow()}
	<div
		class="border-border flex items-center justify-between rounded-sm border bg-transparent px-4 py-3.5"
	>
		<div class="text-sm font-semibold tracking-tight">{m.setup_server()}</div>
		<Link href="{backendUrl}/_/" target="_blank" rel="noreferrer" class="font-mono text-lg">
			{backendUrl}
		</Link>
	</div>
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
