<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
