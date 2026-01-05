<script lang="ts">
	import CanutinIcon from '$lib/components/canutin-icon.svelte';

	import AuthForm from './auth-form.svelte';
</script>

<div class="flex h-screen w-full flex-col items-center px-4">
	<a href="https://canutin.com" class="bg-brand px-3 pt-6 pb-3">
		<CanutinIcon class="size-6 text-white" />
	</a>
	<div class="flex w-full flex-1 items-center justify-center">
		<AuthForm mode="login" />
	</div>
</div>
