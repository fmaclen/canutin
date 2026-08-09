<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CanutinIcon from '$lib/components/canutin-icon.svelte';
	import CanutinWordmark from '$lib/components/canutin-wordmark.svelte';
	import GuestBackdrop from '$lib/components/guest-backdrop.svelte';
	import { getPageTitle } from '$lib/components/page';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import { linkSession, type PlaidAccount } from './link-session.svelte';

	type PlaidHandler = {
		open: () => void;
		destroy: () => void;
	};

	type PlaidFactory = {
		create: (options: {
			token: string;
			onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
			onExit: () => void;
		}) => PlaidHandler;
	};

	function hasPlaidFactory(value: Window): value is Window & { Plaid: PlaidFactory } {
		return (
			'Plaid' in value &&
			typeof value.Plaid === 'object' &&
			value.Plaid !== null &&
			'create' in value.Plaid &&
			typeof value.Plaid.create === 'function'
		);
	}

	const pb = getPocketBaseContext();

	$effect(() => {
		let cancelled = false;
		let succeeded = false;
		let handler: PlaidHandler | undefined;

		void (async () => {
			try {
				const { linkToken } = await pb.authedClient.send<{ linkToken: string }>(
					'/api/canutin/plaid/link-token',
					{ method: 'POST' }
				);
				if (cancelled) return;

				if (!hasPlaidFactory(window)) {
					await new Promise<void>((resolveScript, rejectScript) => {
						const existing = document.querySelector<HTMLScriptElement>('script[data-plaid-link]');
						const script = existing ?? document.createElement('script');
						script.addEventListener('load', () => resolveScript(), { once: true });
						script.addEventListener(
							'error',
							() => {
								script.remove();
								rejectScript(new Error('Plaid Link script failed to load'));
							},
							{ once: true }
						);
						if (!existing) {
							script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
							script.dataset.plaidLink = '';
							document.head.append(script);
						}
					});
				}
				if (cancelled || !hasPlaidFactory(window)) return;

				const createdHandler = window.Plaid.create({
					token: linkToken,
					onSuccess: (publicToken, metadata) => {
						succeeded = true;
						handler?.destroy();
						const institutionName = metadata.institution?.name ?? '';
						void (async () => {
							try {
								const response = await pb.authedClient.send<{
									connectionId: string;
									accounts: PlaidAccount[];
								}>('/api/canutin/plaid/exchange', {
									method: 'POST',
									body: { publicToken, institutionName }
								});
								if (cancelled) return;
								linkSession.connectionId = response.connectionId;
								linkSession.institutionName = institutionName;
								linkSession.accounts = response.accounts;
								await goto(resolve('/accounts/link/match'));
							} catch (error) {
								if (cancelled) return;
								logError('plaidLink', 'exchange', error);
								toast.error(m.accounts_link_exchange_failed());
								await goto(resolve('/accounts'));
							}
						})();
					},
					onExit: () => {
						if (!succeeded) void goto(resolve('/accounts'));
					}
				});
				handler = createdHandler;
				createdHandler.open();
			} catch (error) {
				if (cancelled) return;
				logError('plaidLink', 'start', error);
				toast.error(m.accounts_link_start_failed());
				await goto(resolve('/accounts'));
			}
		})();

		return () => {
			cancelled = true;
			handler?.destroy();
		};
	});
</script>

<svelte:head>
	<title>{getPageTitle(m.accounts_link_page_title())}</title>
</svelte:head>

<GuestBackdrop />
<div
	class="relative flex min-h-dvh w-full items-center justify-center gap-3.5 px-6"
	role="img"
	aria-label={m.app_name()}
>
	<CanutinIcon class="size-7 shrink-0" fill="brand" />
	<CanutinWordmark class="dark:text-foreground h-5 w-auto text-stone-700" />
</div>
