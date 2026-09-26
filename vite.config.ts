import { existsSync } from 'node:fs';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import pkg from './package.json';

// Vite runs under Node, which never sees the ports a worktree pinned in .env; load it
// here like playwright.config.ts does. Variables already in the environment still win.
const envFile = new URL('.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
	define: {
		// The Docker build checks out the commit before semantic-release bumps package.json,
		// so the release workflow passes the published version through APP_VERSION.
		__APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkg.version)
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		})
	],
	// Loopback IPv4 with strict ports: a slot collision fails instead of drifting, and
	// `dev-link` can proxy the port to the tailnet, whose Host header Vite must accept.
	server: {
		host: '127.0.0.1',
		port: Number(process.env.VITE_PORT ?? 5173),
		strictPort: true,
		allowedHosts: ['.ts.net']
	},
	preview: {
		host: '127.0.0.1',
		port: Number(process.env.VITE_PREVIEW_PORT ?? process.env.VITE_PORT ?? 42069),
		strictPort: true,
		allowedHosts: ['.ts.net']
	}
});
