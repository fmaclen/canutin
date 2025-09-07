<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const authUrl = resolve('/auth');

	$effect.pre(() => {
		goto(authUrl);
	});
</script>
