<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAuthContext } from '$lib/auth.svelte';

	let { children } = $props();

	const auth = getAuthContext();

	$effect(() => {
		// FIXME: Skip auth guard for specific demo route (temporary)
		if (page.url.pathname.startsWith('/demo/paraglide')) return;

		if (auth.isLoading) return;

		const pathname = page.url.pathname;
		const isAuth = pathname === '/auth' || pathname.startsWith('/auth/');
		const isRoot = pathname === '/';

		// Decide desired target based on auth state and current location
		type Target = '/auth' | '/big-picture' | null;
		let target: Target = null;
		if (auth.currentUser?.isValid) {
			// If already authenticated, avoid staying on guest routes or root
			if (isAuth || isRoot) target = '/big-picture';
		} else {
			// If not authenticated, keep guest routes accessible; redirect others
			if (!isAuth) target = '/auth';
		}

		if (target && pathname !== target) {
			goto(resolve(target), { replaceState: true });
		}
	});
</script>

{@render children?.()}
