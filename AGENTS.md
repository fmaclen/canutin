# Repository Guidelines

## Project Structure & Module Organization
- `src/` — SvelteKit app (routes in `src/routes`, shared code in `src/lib`, global HTML/CSS in `src/app.html` and `src/app.css`).
- `static/` — Public assets served at site root.
- `e2e/` — Playwright tests (e.g., `e2e/auth.test.ts`).
- `scripts/` — Dev utilities (e.g., `scripts/server.ts` for PocketBase).
- `pocketbase/` — Downloaded runtime assets created by the PocketBase script.

## Build, Test, and Development Commands
- `bun run dev` — Start Vite dev server.
- `bun run build` — Production build via Vite/SvelteKit.
- `bun run preview` — Preview the built app.
- `bun run check` — Type-check with `svelte-check`.
- `bun run lint` — Prettier check + ESLint.
- `bun run format` — Auto-format with Prettier.
- `bun run quality` — Format, lint, and type-check.
- `bun run test` — Run Playwright e2e tests.
- `bun run pb` — Ensure and start PocketBase locally.

## Coding Style & Naming Conventions
- Formatting: Prettier (tabs, single quotes, width 100, no trailing commas). Run `bun run format`.
- Linting: ESLint with Svelte/TS configs. Run `bun run lint`.
- TypeScript: strict mode; prefer explicit types on exports and public APIs.
- Files: follow SvelteKit conventions (`+page.svelte`, `+layout.ts`). Components in `src/lib/components` use kebab-case (e.g., `card-title.svelte`).
- Imports: grouped/sorted (see `.prettierrc` import order).

## Testing Guidelines
- Framework: Playwright (`@playwright/test`). Tests live in `e2e/*.test.ts`.
- Run locally: `bun run test` (config starts PocketBase and `preview`).
- Write deterministic tests: use role-based selectors (e.g., `getByRole('button', { name: 'Login' })`).
- Avoid shared state: generate unique data (e.g., `alice+${Date.now()}@example.com`).

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (`feat:`, `fix:`, `docs:`) as in git history.
- PRs: include a clear summary, linked issues, and screenshots/GIFs for UI changes.
- Checks: run `bun run quality && bun run test` before submitting. Note any migrations or breaking changes.

## Security & Configuration Tips
- PocketBase dev defaults: `PB_HOST=127.0.0.1`, `PB_PORT=42070`, superuser from `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` (see `scripts/server.ts`).
- Do not commit secrets. Use environment variables for local overrides.
