<script lang="ts">
	import { page } from '$app/state';
	import Link from '$lib/components/link.svelte';
	import SplashScreen from '$lib/components/splash-screen.svelte';
	import { m } from '$lib/paraglide/messages';
</script>

<SplashScreen href="https://canutin.com">
	<div class="flex flex-col gap-1.5 text-center">
		<h1 class="text-2xl leading-none font-semibold">{m.setup_title()}</h1>
		<p class="text-muted-foreground text-sm">{m.setup_description()}</p>
	</div>
	<div
		class="border-border flex items-center justify-between rounded-sm border bg-transparent px-4 py-3.5"
	>
		<div class="text-sm font-semibold tracking-tight">{m.setup_server()}</div>
		<Link href="/_/" target="_blank" rel="noreferrer" class="font-mono text-lg">
			{page.url.origin}
		</Link>
	</div>
</SplashScreen>
