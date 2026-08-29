// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Injected by Vite's `define` at build time from package.json or APP_VERSION.
	const __APP_VERSION__: string;

	type PlaidHandler = {
		open: () => void;
		destroy: () => void;
	};

	// Plaid Link attaches its factory to `window` once its CDN script has loaded.
	interface Window {
		Plaid?: {
			create: (options: {
				token: string;
				onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
				onExit: () => void;
			}) => PlaidHandler;
		};
	}
}

export {};
