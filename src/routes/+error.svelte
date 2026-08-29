<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Link from '$lib/components/link.svelte';
	import { getPageTitle } from '$lib/components/page';
	import SplashScreen from '$lib/components/splash-screen.svelte';
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{getPageTitle(m.error_title({ status: page.status }))}</title>
</svelte:head>

<!-- "/" lands on the big picture when signed in and the sign-in page when not, so both the brand
     header and the description link defer to it. -->
<SplashScreen href={resolve('/')}>
	<div class="flex flex-col gap-3 text-center">
		<h1 class="text-5xl leading-none font-bold">{page.status}</h1>
		{#if page.status === 404}
			<p class="text-muted-foreground text-sm">
				{m.error_not_found_description()}
				<Link href={resolve('/')}>{m.error_link_back()}</Link>
			</p>
		{:else}
			<p class="text-muted-foreground text-sm">{page.error?.message}</p>
		{/if}
	</div>
</SplashScreen>
