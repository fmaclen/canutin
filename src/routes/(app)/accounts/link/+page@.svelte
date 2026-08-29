<script lang="ts">
	import { ClientResponseError } from 'pocketbase';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getPageTitle } from '$lib/components/page';
	import SplashScreen from '$lib/components/splash-screen.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	import { linkSession, type PlaidAccount } from './link-session.svelte';

	type SyncResponse = {
		created: number;
		skipped: number;
		failed: number;
	};

	const pb = getPocketBaseContext();

	// Re-authenticating an existing connection reuses this handshake in Plaid's update mode: the
	// widget opens already bound to the bank, so there is nothing to exchange or match afterwards.
	const reconnectConnectionId = $derived(page.url.searchParams.get('reconnect'));
	const exitRoute = $derived(reconnectConnectionId ? '/settings/connections' : '/accounts');

	$effect(() => {
		let cancelled = false;
		let succeeded = false;
		let handler: PlaidHandler | undefined;

		void (async () => {
			try {
				const { linkToken } = await pb.authedClient.send<{ linkToken: string }>(
					'/api/canutin/plaid/link-token',
					reconnectConnectionId
						? { method: 'POST', body: { connectionId: reconnectConnectionId } }
						: { method: 'POST' }
				);
				if (cancelled) return;

				if (!window.Plaid) {
					await new Promise<void>((resolveScript, rejectScript) => {
						const script = document.createElement('script');
						script.addEventListener('load', () => resolveScript(), { once: true });
						script.addEventListener(
							'error',
							() => {
								script.remove();
								rejectScript(new Error('Plaid Link script failed to load'));
							},
							{ once: true }
						);
						script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
						document.head.append(script);
					});
				}
				if (cancelled || !window.Plaid) return;

				const createdHandler = window.Plaid.create({
					token: linkToken,
					onSuccess: (publicToken, metadata) => {
						succeeded = true;
						handler?.destroy();

						if (reconnectConnectionId) {
							// A successful sync is what clears the connection's re-authentication flag.
							void (async () => {
								try {
									const result = await pb.authedClient.send<SyncResponse>(
										`/api/canutin/plaid/connections/${reconnectConnectionId}/sync`,
										{ method: 'POST' }
									);
									if (cancelled) return;
									if (result.failed > 0) {
										toast.warning(
											m.settings_connections_sync_partial({
												created: result.created,
												skipped: result.skipped,
												failed: result.failed
											})
										);
									} else {
										toast.success(
											m.settings_connections_sync_success({
												created: result.created,
												skipped: result.skipped
											})
										);
									}
								} catch (error) {
									if (cancelled) return;
									if (
										error instanceof ClientResponseError &&
										error.status === 409 &&
										error.response?.error === 'plaid_sync_in_progress'
									) {
										toast.info(m.settings_connections_sync_in_progress());
									} else {
										logError('plaidLink', 'reconnect_sync', error);
										toast.error(m.settings_connections_sync_failed());
									}
								}
								await goto(resolve(exitRoute));
							})();
							return;
						}

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
						if (!succeeded) void goto(resolve(exitRoute));
					}
				});
				handler = createdHandler;
				createdHandler.open();
			} catch (error) {
				if (cancelled) return;
				logError('plaidLink', 'start', error);
				toast.error(m.accounts_link_start_failed());
				await goto(resolve(exitRoute));
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

<SplashScreen spinner={false} />
