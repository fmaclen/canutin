<script lang="ts">
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';

	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { getAuthContext } from '$lib/auth.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { m } from '$lib/paraglide/messages.js';

	const auth = getAuthContext();

	function isActive(url: string) {
		return $page.url.pathname === url;
	}

	async function handleLogout() {
		await auth.logout();
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<Sidebar.MenuButton isActive={isActive(resolve('/settings'))}>
			{#snippet child({ props })}
				<a href={resolve('/settings')} {...props}>
					<SettingsIcon />
					<span>{m.user_settings()}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
	<Sidebar.MenuItem>
		<Sidebar.MenuButton onclick={handleLogout}>
			<LogOutIcon />
			<span>{m.user_logout()}</span>
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
</Sidebar.Menu>
