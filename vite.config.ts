import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import pkg from './package.json';

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
	server: {
		port: Number(process.env.VITE_PORT ?? 5173)
	},
	preview: {
		port: Number(process.env.VITE_PREVIEW_PORT ?? process.env.VITE_PORT ?? 42069)
	}
});
