<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import CanutinWordmark from '$lib/components/canutin-wordmark.svelte';
	import { getDemoContext } from '$lib/demo/demo.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const auth = getAuthContext();
	const demo = getDemoContext();

	let started = $state(false);

	$effect(() => {
		if (auth.isLoading) return;
		if (started) return;
		started = true;
		runDemo();
	});

	async function runDemo() {
		if (!demo.isEnabled) {
			goto(resolve('/auth'), { replaceState: true });
			return;
		}

		const result = await demo.startDemo();
		if (result.success) {
			goto(resolve('/'), { replaceState: true });
		} else {
			goto(resolve('/auth'), { replaceState: true });
		}
	}
</script>

<div
	class="flex min-h-dvh w-full items-center justify-center gap-3.5 px-6"
	role="img"
	aria-label={m.app_name()}
>
	<CanutinIcon class="size-7 shrink-0" fill="brand" />
	<CanutinWordmark class="dark:text-foreground h-5 w-auto text-stone-700" />
</div>
