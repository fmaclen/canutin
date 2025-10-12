<script lang="ts">
	import { page } from '$app/state';
	import Page from '$lib/components/page.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { m } from '$lib/paraglide/messages';
</script>

<Page pageTitle={m.error_title({ status: page.status })}>
	<div class="flex h-screen w-full items-center justify-center px-4">
		<Card.Root class="mx-auto w-full max-w-sm">
			<Card.Header>
				<Card.Title class="text-2xl">{m.error_title({ status: page.status })}</Card.Title>
				<Card.Description>{page.error?.message}</Card.Description>
			</Card.Header>
		</Card.Root>
	</div>
</Page>
