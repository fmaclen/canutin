# Repository Guidelines

## Project Structure & Module Organization

- `src/` — SvelteKit app (routes in `src/routes`, shared code in `src/lib`, globals in `src/app.html` and `src/app.css`).
- `static/` — Public assets served at site root.
- `e2e/` — Playwright tests (e.g., `e2e/auth.test.ts`).
- `scripts/` — Dev utilities (e.g., `scripts/server.ts` for PocketBase).
- `pocketbase/` — Runtime assets created by the PB script.

## Build, Test, and Development Commands

- `bun run dev` — Start Vite dev server.
- `bun run build` | `bun run preview` — Production build and preview.
- `bun run check` | `bun run check:watch` — Type-check with svelte-check.
- `bun run lint` | `bun run format` | `bun run quality` — Lint, format, and run both.
- `bun run test` — Run Playwright e2e tests (spins up PocketBase + preview).
- `bun run pb` — Ensure and start PocketBase locally.
- `bun run pb:import temp/Canutin.demo.vault` — Import Canutin v1 vault (dev only).
- `bun run pb:reset` — Reset the dev PocketBase database.

## Coding Style & Naming Conventions

- Formatting via Prettier: tabs, single quotes, width 100, no trailing commas. Run `bun run format`.
- Linting via ESLint (Svelte/TS configs). Run `bun run lint`.
- TypeScript: strict mode. Explicit types required (params/exports); `any` is forbidden. Omit explicit return types—use inference.
- Files follow SvelteKit conventions (`+page.svelte`, `+layout.ts`). Components in `src/lib/components` use kebab-case (e.g., `card-title.svelte`).

## Svelte 5 Runes Syntax

- Prefer runes over legacy `$:` reactivity.
- State: `let count = $state(0); count++;` Works for objects/arrays: `let user = $state({ name: 'A' }); user.name = 'B';`.
- Derived: `const doubled = $derived(() => count * 2);` Automatically tracks dependencies.
- Effects: `$effect(() => { console.debug(count); return () => {/* cleanup */}; });` for reactive side effects with optional cleanup. Replaces `onMount`; returning a cleanup replaces `onDestroy`.
- Props: `let { id = '', onSelect } = $props();` Prefer destructuring with defaults; updates from parents are reactive.
- Types: annotate as usual (no `any`). Example: `let count: number = $state(0);` or `let user: { name: string } = $state({ name: '' });`.
- Events: use DOM-style `onclick={...}` instead of `on:click={...}` (same for other events like `oninput`).
- Snippets: define in parent and render in child. Example parent: `{#snippet Row({ item })}<li>{item.name}</li>{/snippet}` then `<List row={Row}/>`; child: `let { row } = $props(); {@render row({ item })}`. Type with `import type { Snippet } from 'svelte';` and `row: Snippet<[ { item: Item } ]>`.
- Children: default children are a snippet available as `$props.children`. In child: `let { children } = $props(); {@render children?.()}` or pass context: `{@render children?.({ item })}`.
- Read more (and other changes like snippets/slots, transitions/animations, store interop, and migration tips): https://svelte.dev/docs/svelte/v5-migration-guide

## Testing Guidelines

- Framework: Playwright (`@playwright/test`) with tests in `e2e/*.test.ts`.
- Deterministic: use role-based selectors (e.g., `page.getByRole('button', { name: 'Login' })`).
- Avoid shared state: generate unique data (e.g., `alice.${Date.now()}@example.com`).
- Add negative assertions before/after positives to catch false positives (e.g., `await expect(l).not.toBeVisible();` then `await expect(l).toBeVisible();`).
- Run with `bun run test`. CI-like local run: `bun run quality && bun run test`.

## Commit & Pull Request Guidelines

- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`). Keep messages scoped and clear.
- Before PRs: `bun run quality && bun run test` must pass.
- PRs include a summary, linked issues, and screenshots/GIFs for UI changes. Call out migrations or breaking changes.

## Security & Configuration Tips

- PocketBase dev defaults: `PB_HOST=127.0.0.1`, `PB_PORT=42070`. Superuser via `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` (see `scripts/server.ts`).
- Do not commit secrets. Use environment variables for local overrides.

## Database & Schema

- Schema/types live in `src/lib/pocketbase.schema.ts`. Reference these types in app code and tests when interacting with PocketBase.
- Keep code aligned with the schema; prefer schema-driven types over ad‑hoc interfaces.
- PocketBase hooks (JS): type with JSDoc. Example: `/** @param {import('src/lib/pocketbase.schema').TypedPocketBase} pb */` and `/** @type {import('src/lib/pocketbase.schema').TransactionsRecord} */`.
- Include auto‑generated typedefs where applicable, e.g.: `/** @typedef {import('../pb_data/types').RecordEvent} RecordEvent */`.

## Data Import (for agents)

- Start PB: `bun run pb`.
- Import vault: `bun run pb:import <path-to-old>.vault` (e.g., `temp/Canutin.demo.vault`). Upserts related types/labels only when referenced.
- Intended for development; reset with `bun run pb:reset`.
