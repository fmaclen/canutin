<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import { getDemoContext } from '$lib/demo/demo.svelte';

	const demo = getDemoContext();

	let started = $state(false);

	$effect(() => {
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

<div class="flex h-screen w-full items-center justify-center">
	<CanutinIcon class="size-12" fill="brand" />
</div>
