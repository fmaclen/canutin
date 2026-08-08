<script lang="ts">
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import CanutinWordmark from '$lib/components/canutin-wordmark.svelte';
	import { m } from '$lib/paraglide/messages.js';

	import AuthForm from '../auth-form.svelte';
</script>

<div class="flex h-screen w-full flex-col items-center px-4">
	<a href="https://canutin.com" aria-label={m.app_name()} class="flex items-center gap-2.5 py-8">
		<CanutinIcon class="size-5" fill="brand" />
		<CanutinWordmark class="dark:text-foreground h-3.5 w-auto text-stone-700" />
	</a>
	<div class="flex w-full flex-1 items-center justify-center">
		<AuthForm mode="signup" />
	</div>
</div>
