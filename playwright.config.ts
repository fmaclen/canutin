import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';

const BASE_URL = 'http://localhost:4173';

export enum Projects {
	DESKTOP_CHROMIUM = 'desktop',
	MOBILE_WEBKIT = 'mobile'
}

export default defineConfig({
	webServer: [
		{
			command: 'npm run pb',
			port: 42070,
			reuseExistingServer: true
		},
		{
			command: 'npm run build && npm run preview',
			port: 4173
		}
	],
	testDir: 'e2e',
	retries: isCI ? 2 : 0,
	projects: [
		{
			name: Projects.DESKTOP_CHROMIUM,
			use: {
				...devices['Desktop Chrome'],
				baseURL: BASE_URL,
				trace: 'retain-on-failure',
				permissions: ['clipboard-read', 'clipboard-write']
			}
		},
		{
			name: Projects.MOBILE_WEBKIT,
			use: {
				...devices['iPhone 13'],
				baseURL: BASE_URL,
				trace: 'retain-on-failure'
			}
		}
	]
});
