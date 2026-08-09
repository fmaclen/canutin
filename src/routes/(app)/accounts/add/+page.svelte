<script lang="ts">
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { ClientResponseError } from 'pocketbase';

	import { resolve } from '$app/paths';
	import GuestBackdrop from '$lib/components/guest-backdrop.svelte';
	import Page from '$lib/components/page.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';
	import { getPocketBaseContext } from '$lib/pocketbase.svelte';

	const pb = getPocketBaseContext();

	const choices = [
		{
			route: '/accounts/link',
			icon: RefreshCwIcon,
			title: m.accounts_link_page_title(),
			description: m.accounts_add_choice_link_description()
		},
		{
			route: '/accounts/add/manual',
			icon: PencilLineIcon,
			title: m.accounts_add_manual_page_title(),
			description: m.accounts_add_choice_manual_description()
		}
	] as const;

	let notConfigured = $state(false);

	$effect(() => {
		void probePlaid();
	});

	// Asking for a link token is the only way to tell whether this server has Plaid credentials, and
	// probing here keeps the user from clicking through to a dead end.
	async function probePlaid() {
		try {
			await pb.authedClient.send('/api/canutin/plaid/link-token', { method: 'POST' });
		} catch (error) {
			notConfigured =
				error instanceof ClientResponseError &&
				error.status === 503 &&
				error.response?.error === 'plaid_not_configured';
			if (!notConfigured) logError('accountsAdd', 'link_token_probe', error);
		}
	}
</script>

<Page
	pageTitle={m.accounts_add_page_title()}
	crumbs={[
		{ label: m.sidebar_accounts(), href: resolve('/accounts') },
		{ label: m.accounts_add_page_title() }
	]}
>
	<!-- Negative margins cancel the page's own padding so the backdrop reaches the edges of the
	     content area; the height allowance is the sticky breadcrumb bar plus the page header. -->
	<div
		class="relative -m-6 flex min-h-[calc(100dvh-10.5rem)] items-center justify-center p-6 sm:-m-8 sm:p-8"
	>
		<GuestBackdrop contained />
		<div class="relative grid w-full max-w-2xl gap-6 sm:grid-cols-2">
			{#each choices as choice (choice.route)}
				{#if choice.route === '/accounts/link' && notConfigured}
					<Card.Root class="h-full gap-0 overflow-hidden py-0 shadow-md">
						<div class="bg-muted text-muted-foreground flex items-center border-b px-6 py-4">
							<choice.icon class="size-9" strokeWidth={1.25} />
						</div>
						<Card.Header class="gap-2 py-5">
							<Card.Title>{choice.title}</Card.Title>
							<Card.Description>{m.accounts_link_unavailable()}</Card.Description>
						</Card.Header>
					</Card.Root>
				{:else}
					<a
						href={resolve(choice.route)}
						class="focus-visible:ring-ring group rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<Card.Root
							class="h-full gap-0 overflow-hidden py-0 shadow-md transition-shadow group-hover:shadow-xl"
						>
							<div class="bg-brand-secondary text-brand flex items-center border-b px-6 py-4">
								<choice.icon class="size-9" strokeWidth={1.25} />
							</div>
							<Card.Header class="gap-2 py-5">
								<Card.Title>{choice.title}</Card.Title>
								<Card.Description>{choice.description}</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/if}
			{/each}
		</div>
	</div>
</Page>
