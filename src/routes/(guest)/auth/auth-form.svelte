<script lang="ts">
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { m } from '$lib/paraglide/messages.js';

	let { mode = 'login' }: { mode?: 'login' | 'signup' } = $props();

	const id = $props.id();

	const auth = getAuthContext();

	const email = $state('');
	const password = $state('');
	const password2 = $state('');

	const title = $derived(mode === 'signup' ? m.auth_signup_title() : m.auth_login_title());
	const description = $derived(
		mode === 'signup' ? m.auth_signup_description() : m.auth_login_description()
	);
	const primaryText = $derived(
		mode === 'signup' ? m.auth_primary_signup() : m.auth_primary_login()
	);
	const altCtaText = $derived(
		mode === 'signup' ? m.auth_alt_have_account() : m.auth_alt_no_account()
	);
	const altCtaHref = $derived(mode === 'signup' ? '/auth' : '/auth/sign-up');
	const altCtaLinkText = $derived(mode === 'signup' ? m.auth_link_login() : m.auth_link_signup());

	async function handleSubmit() {
		if (auth.isLoading) return;
		if (mode === 'signup') {
			if (password !== password2) {
				// FIXME: show localized error for password mismatch
				return;
			}
			await auth.signup(email, password);
		} else {
			await auth.login(email, password);
		}
		// FIXME: redirect on success
	}
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="grid gap-4" method="post" onsubmit={(e) => (e.preventDefault(), handleSubmit())}>
			<div class="grid gap-2">
				<Label for="email-{id}">{m.auth_email_label()}</Label>
				<Input
					id="email-{id}"
					type="email"
					placeholder={m.auth_email_placeholder()}
					value={email}
					required
				/>
			</div>

			<div class="grid gap-2">
				<Label for="password-{id}">{m.auth_password_label()}</Label>
				<Input id="password-{id}" type="password" value={password} required />
			</div>

			{#if mode === 'signup'}
				<div class="grid gap-2">
					<Label for="password2-{id}">{m.auth_password_confirm_label()}</Label>
					<Input id="password2-{id}" type="password" value={password2} required />
				</div>
			{/if}

			{#if auth.error}
				<p class="text-sm text-red-600">{auth.error}</p>
			{/if}

			<Button type="submit" class="w-full" disabled={auth.isLoading}>{primaryText}</Button>
		</form>
		<div class="mt-4 text-center text-sm">
			{altCtaText}
			<a href={resolve(altCtaHref)} class="underline"> {altCtaLinkText} </a>
		</div>
	</Card.Content>
</Card.Root>
