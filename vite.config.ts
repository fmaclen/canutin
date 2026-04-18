import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const vitePort = Number(process.env.VITE_PORT ?? 5173);

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
		port: vitePort
	},
	preview: {
		port: Number(process.env.VITE_PREVIEW_PORT ?? vitePort)
	}
});
