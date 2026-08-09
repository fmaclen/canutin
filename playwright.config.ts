import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

import { plaidFakePort } from './e2e/plaid.helpers';

// Worktrees pin their ports in a repo-local .env; load it here so an unsourced
// shell still targets this checkout's servers instead of the defaults below
// (which can attach to another checkout's PocketBase via reuseExistingServer).
// loadEnvFile never overrides variables already in the environment, so explicit
// exports still win.
const envFile = new URL('.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const isCI = process.env.CI === 'true';

const PB_PORT = Number(process.env.PB_PORT ?? 42070);
const VITE_PORT = Number(process.env.VITE_PREVIEW_PORT ?? process.env.VITE_PORT ?? 42069);
const BASE_URL = `http://localhost:${VITE_PORT}`;

export default defineConfig({
	globalSetup: 'e2e/global.setup.ts',
	webServer: [
		{
			command: 'bun e2e/plaid.server.ts',
			port: plaidFakePort(),
			reuseExistingServer: true
		},
		{
			command: 'bun run pb',
			port: PB_PORT,
			reuseExistingServer: true,
			// The Plaid values come last on purpose: they must beat whatever credentials the
			// developer's .env holds so a test can never reach a real Plaid environment.
			env: {
				...process.env,
				PUBLIC_DEMO_ENABLED: 'true',
				FX_FETCH_DISABLED: 'true',
				PLAID_CLIENT_ID: 'fake-client-id',
				PLAID_SECRET: 'fake-secret',
				PLAID_ENV: 'sandbox',
				PLAID_BASE_URL: `http://127.0.0.1:${plaidFakePort()}`
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
