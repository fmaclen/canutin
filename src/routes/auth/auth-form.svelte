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
			<Button variant="outline" class="w-full">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
					<path
						d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
						fill="currentColor"
					/>
				</svg>
				{mode === 'signup' ? 'Sign up with Google' : 'Login with Google'}
			</Button>
		</form>
		<div class="mt-4 text-center text-sm">
			{altCtaText}
			<a href={resolve(altCtaHref)} class="underline"> {altCtaLinkText} </a>
		</div>
	</Card.Content>
</Card.Root>
