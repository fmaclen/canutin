<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAuthContext } from '$lib/auth.svelte';
	import { getDemoContext } from '$lib/demo/demo.svelte';

	let { children } = $props();

	const auth = getAuthContext();
	const demo = getDemoContext();

	$effect(() => {
		// TODO(#309): Remove once language switcher UI is added
		if (page.url.pathname.startsWith('/demo/paraglide')) return;

		if (auth.isLoading) return;

		const pathname = page.url.pathname;
		const isAuth = pathname === '/auth' || pathname.startsWith('/auth/');
		const isDemo = pathname === '/demo';
		const isGuestRoute = isAuth || isDemo;
		const isRoot = pathname === '/';

		// Don't redirect away from /demo while demo is starting or seeding
		if (isDemo && (demo.isStarting || demo.isSeeding)) {
			return;
		}

		// Decide desired target based on auth state and current location
		type Target = '/auth' | '/big-picture' | null;
		let target: Target = null;
		if (auth.currentUser?.isValid) {
			// If already authenticated, avoid staying on guest routes or root
			if (isGuestRoute || isRoot) target = '/big-picture';
		} else {
			// If not authenticated, keep guest routes accessible; redirect others
			if (!isGuestRoute) target = '/auth';
		}

		if (target && pathname !== target) {
			goto(resolve(target), { replaceState: true });
		}
	});
</script>

{#if !auth.isLoading}
	{@render children?.()}
{/if}
