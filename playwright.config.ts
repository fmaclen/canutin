import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';

const PB_PORT = Number(process.env.PB_PORT ?? 42070);
const VITE_PORT = Number(process.env.VITE_PREVIEW_PORT ?? process.env.VITE_PORT ?? 42069);
const BASE_URL = `http://localhost:${VITE_PORT}`;

export default defineConfig({
	globalSetup: 'e2e/global.setup.ts',
	webServer: [
		{
			command: 'bun run pb',
			port: PB_PORT,
			reuseExistingServer: true,
			env: {
				...process.env,
				PUBLIC_DEMO_ENABLED: 'true',
				FX_FETCH_DISABLED: 'true'
			}
		},
		{
			command: 'bun run build && bun run preview',
			port: VITE_PORT,
			env: {
				...process.env,
				PUBLIC_PLAYWRIGHT_TESTING: 'true',
				PUBLIC_DEMO_ENABLED: 'true'
			}
		}
	],
	testDir: 'e2e',
	retries: isCI ? 2 : 0,
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				baseURL: BASE_URL,
				trace: 'retain-on-failure',
				permissions: ['clipboard-read', 'clipboard-write']
			}
		},
		{
			name: 'mobile',
			use: {
				...devices['iPhone 13'],
				baseURL: BASE_URL,
				trace: 'retain-on-failure',
				// WebKit crashes on headless Linux CI (EGL_NOT_INITIALIZED at page.goto); run it
				// headed under xvfb instead (see .github/workflows/test.yml).
				headless: !isCI
			}
		}
	]
});
