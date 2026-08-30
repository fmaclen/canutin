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

// Recording a trace for every test costs time across the whole CI matrix, where only a
// retried test is worth inspecting. Locally retries are off, so a failure has to keep its
// own trace or there is nothing left to debug.
const trace = isCI ? 'on-first-retry' : 'retain-on-failure';

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
			// `bun run pb` compiles the Go backend whenever the build hash is stale, which it
			// always is on a fresh CI runner. Playwright's 60s default cuts that off mid-build.
			timeout: 180_000,
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
			// A cold production build on a CI runner runs close to Playwright's 60s default,
			// which fails as an opaque launch timeout rather than a build error.
			timeout: 180_000,
			env: {
				...process.env,
				PUBLIC_PLAYWRIGHT_TESTING: 'true',
				PUBLIC_DEMO_ENABLED: 'true'
			}
		}
	],
	testDir: 'e2e',
	retries: isCI ? 2 : 0,
	// Playwright defaults to half the logical cores, which is 2 of the 4 an ubuntu-latest
	// runner has. Seeding is I/O against PocketBase rather than CPU work, so the suite has
	// room for all four.
	workers: isCI ? 4 : undefined,
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				baseURL: BASE_URL,
				trace,
				permissions: ['clipboard-read', 'clipboard-write']
			}
		},
		{
			name: 'mobile',
			use: {
				...devices['iPhone 13'],
				baseURL: BASE_URL,
				trace,
				// WebKit crashes on headless Linux CI (EGL_NOT_INITIALIZED at page.goto); run it
				// headed under xvfb instead (see .github/workflows/test.yml).
				headless: !isCI
			}
		}
	]
});
