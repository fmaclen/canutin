<script lang="ts">
	import { dev } from '$app/environment';
	import { getAuthContext } from '$lib/auth.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const auth = getAuthContext();
	const pb = getPocketBaseContext();

	type DevUser = { id: string; email: string };
	let users: DevUser[] = $state([]);

	async function fetchUsers(): Promise<void> {
		try {
			const url = pb.authedClient.buildURL('/api/dev/example-users');
			const res = await fetch(url.toString());
			if (!res.ok) throw new Error('failed');
			users = (await res.json()) as DevUser[];
		} catch {
			users = [];
		}
	}

	$effect(() => {
		if (!dev) return;
		void fetchUsers();
	});

	async function handleAutoLogin(email: string): Promise<void> {
		await auth.login(email, '123qweasdzxc');
	}
</script>

{#if users.length}
	<div class="mt-2 grid gap-2">
		{#each users as user (user.id)}
			<Button
				variant="outline"
				size="sm"
				class="flex w-full text-center"
				disabled={auth.isLoading}
				onclick={() => handleAutoLogin(user.email)}
			>
				{user.email}
			</Button>
		{/each}
	</div>
{/if}
