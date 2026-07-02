<script lang="ts">
	import PocketBase, { type RecordSubscription } from 'pocketbase';

	import { getAuthContext } from '$lib/auth.svelte';
	import { Button } from '$lib/components/ui/button';
	import { logError } from '$lib/logger';
	import type { UsersResponse } from '$lib/pocketbase.schema';
	import { getBackendUrl } from '$lib/utils';

	const auth = getAuthContext();

	type DevUser = { id: string; email: string };
	let users: DevUser[] = $state([]);

	const DEV_SUPERADMIN_EMAIL = 'superadmin@example.com';
	const DEV_SUPERADMIN_PASSWORD = '123qweasdzxc';

	function isExampleUser(email: string) {
		return email.endsWith('@example.com');
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
		const adminPb = new PocketBase(getBackendUrl());

		adminPb
			.collection('_superusers')
			.authWithPassword(DEV_SUPERADMIN_EMAIL, DEV_SUPERADMIN_PASSWORD)
			.then(async () => {
				const list = await adminPb
					.collection('users')
					.getFullList<UsersResponse>({ filter: 'email ~ "@example.com"', sort: '-created' });
				users = list.slice(0, 10).map((u) => ({ id: u.id, email: u.email }));

				adminPb
					.collection('users')
					.subscribe('*', onUserEvent)
					.catch((error) => logError('devAuthShortcuts', 'subscribe', error));
			})
			.catch((error) => logError('devAuthShortcuts', 'auth', error));

		return () => {
			adminPb
				.collection('users')
				.unsubscribe('*')
				.catch((error) => logError('devAuthShortcuts', 'unsubscribe', error));
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
				disabled={auth.isSubmitting}
				onclick={() => handleAutoLogin(user.email)}
			>
				{user.email}
			</Button>
		{/each}
	</div>
{/if}
