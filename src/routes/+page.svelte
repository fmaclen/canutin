<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolveRoute } from '$app/paths';

	const authUrl = resolveRoute('/auth');

	$effect.pre(() => {
		goto(authUrl);
	});
</script>
