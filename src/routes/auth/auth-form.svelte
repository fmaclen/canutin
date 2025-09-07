<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

  let { mode = 'login' }: { mode?: 'login' | 'signup' } = $props();

	const id = $props.id();

	const title = $derived(mode === 'signup' ? 'Create account' : 'Login');
	const description =
		$derived(mode === 'signup'
			? 'Enter your email below to create your account'
			: 'Enter your email below to login to your account');
	const primaryText = $derived(mode === 'signup' ? 'Create account' : 'Login');
	const altCtaText = $derived(mode === 'signup' ? 'Already have an account?' : "Don't have an account?");
  const altCtaHref = $derived(mode === 'signup' ? '/auth' : '/auth/sign-up');
	const altCtaLinkText = $derived(mode === 'signup' ? ' Login' : ' Sign up');
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="grid gap-4" method="post" onsubmit={(e) => e.preventDefault()}>
			<div class="grid gap-2">
				<Label for="email-{id}">Email</Label>
				<Input id="email-{id}" type="email" placeholder="m@example.com" required />
			</div>

			<div class="grid gap-2">
				<Label for="password-{id}">Password</Label>
				<Input id="password-{id}" type="password" required />
			</div>

			{#if mode === 'signup'}
				<div class="grid gap-2">
					<Label for="password2-{id}">Confirm password</Label>
					<Input id="password2-{id}" type="password" required />
				</div>
			{/if}

			<Button type="submit" class="w-full">{primaryText}</Button>
		</form>
		<div class="mt-4 text-center text-sm">
			{altCtaText}
			<a href={resolve(altCtaHref)} class="underline"> {altCtaLinkText} </a>
		</div>
	</Card.Content>
</Card.Root>
