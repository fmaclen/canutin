<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getDemoContext } from '$lib/demo/demo.svelte';

	const demo = getDemoContext();

	$effect(() => {
		if (!demo.isEnabled) {
			goto(resolve('/auth'), { replaceState: true });
			return;
		}

		demo.startDemo().then((result) => {
			if (result.success) {
				goto(resolve('/'), { replaceState: true });
			} else {
				goto(resolve('/auth'), { replaceState: true });
			}
		});
	});
</script>
