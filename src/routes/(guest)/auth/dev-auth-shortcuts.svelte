<script lang="ts">
	import PocketBase, { type RecordSubscription } from 'pocketbase';

	import { env } from '$env/dynamic/public';
	import { getAuthContext } from '$lib/auth.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { UsersResponse } from '$lib/pocketbase.schema';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const auth = getAuthContext();
	const pb = getPocketBaseContext();

	type DevUser = { id: string; email: string };
	let users: DevUser[] = $state([]);

	const DEV_SUPERADMIN_EMAIL = 'superadmin@example.com';
	const DEV_SUPERADMIN_PASSWORD = '123qweasdzxc';

	function isExampleUser(email: string) {
		return email.endsWith('@example.com');
	}

	async function fetchUsers() {
		try {
			const url = pb.authedClient.buildURL('/api/dev/example-users');
			const res = await fetch(url.toString());
			if (!res.ok) throw new Error('failed');
			users = (await res.json()) as DevUser[];
		} catch {
			users = [];
		}
	}

	function onUserEvent(e: RecordSubscription<UsersResponse>) {
		const email = e.record.email;
		if (!isExampleUser(email)) return;

		if (e.action === 'create') {
			users = [{ id: e.record.id, email }, ...users].slice(0, 10);
		} else if (e.action === 'delete') {
			users = users.filter((u) => u.id !== e.record.id);
		}
	}

	$effect(() => {
		fetchUsers();

		const adminPb = new PocketBase(env.PUBLIC_PB_URL || 'http://127.0.0.1:42070');

		adminPb
			.collection('_superusers')
			.authWithPassword(DEV_SUPERADMIN_EMAIL, DEV_SUPERADMIN_PASSWORD)
			.then(() => {
				adminPb
					.collection('users')
					.subscribe('*', onUserEvent)
					.catch((error) => console.error('[dev-auth-shortcuts:subscribe]', error));
			})
			.catch((error) => console.error('[dev-auth-shortcuts:auth]', error));

		return () => {
			adminPb
				.collection('users')
				.unsubscribe('*')
				.catch((error) => console.error('[dev-auth-shortcuts:unsubscribe]', error));
		};
	});

	async function handleAutoLogin(email: string) {
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
