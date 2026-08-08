<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAuthContext } from '$lib/auth.svelte';
	import Link from '$lib/components/link.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { getDemoContext } from '$lib/demo/demo.svelte';
	import { m } from '$lib/paraglide/messages.js';

	import DevAuthShortcuts from './dev-auth-shortcuts.svelte';

	let { mode = 'login' }: { mode?: 'login' | 'signup' } = $props();

	const id = $props.id();

	const auth = getAuthContext();
	const demo = getDemoContext();

	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');

	const title = $derived(mode === 'signup' ? m.auth_signup_title() : m.auth_login_title());
	const primaryText = $derived(
		mode === 'signup' ? m.auth_primary_signup() : m.auth_primary_login()
	);
	const altCtaText = $derived(
		mode === 'signup' ? m.auth_alt_have_account() : m.auth_alt_no_account()
	);
	const altCtaHref = $derived(mode === 'signup' ? '/auth' : '/auth/sign-up');
	const altCtaLinkText = $derived(mode === 'signup' ? m.auth_link_login() : m.auth_link_signup());

	async function handleSubmit(event: Event) {
		event.preventDefault();

		if (auth.isSubmitting) return;
		if (mode === 'signup') {
			const result = await auth.signup(email, password, passwordConfirm);
			if (result.success) {
				toast.success(m.auth_signup_success());
				goto(resolve('/auth'));
			}
		} else {
			await auth.login(email, password);
		}
	}
</script>

<div class="mx-auto flex w-full max-w-sm flex-col gap-10">
	<h1 class="text-2xl leading-none font-semibold">{title}</h1>

	<form class="grid gap-4" method="post" onsubmit={handleSubmit}>
		<div class="grid gap-2">
			<Label for="email-{id}">{m.auth_email_label()}</Label>
			<Input
				id="email-{id}"
				type="email"
				placeholder={m.auth_email_placeholder()}
				bind:value={email}
				required
			/>
		</div>

		<div class="grid gap-2">
			<Label for="password-{id}">{m.auth_password_label()}</Label>
			<Input id="password-{id}" type="password" bind:value={password} required />
		</div>

		{#if mode === 'signup'}
			<div class="grid gap-2">
				<Label for="password2-{id}">{m.auth_password_confirm_label()}</Label>
				<Input id="password2-{id}" type="password" bind:value={passwordConfirm} required />
			</div>
		{/if}

		{#if auth.error}
			<p class="text-destructive text-sm">{auth.error}</p>
		{/if}

		<Button type="submit" class="w-full" disabled={auth.isSubmitting}>{primaryText}</Button>

		{#if demo.isEnabled && mode === 'login'}
			<Button href="/demo" variant="outline" class="w-full">{m.demo_try_as_guest()}</Button>
		{/if}

		{#if dev && mode === 'login'}
			<DevAuthShortcuts />
		{/if}
	</form>

	<div class="text-center text-sm">
		{altCtaText}
		<Link href={altCtaHref}>{altCtaLinkText}</Link>
	</div>
</div>
