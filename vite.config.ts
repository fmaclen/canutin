import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
