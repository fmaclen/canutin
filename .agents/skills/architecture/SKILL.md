---
name: architecture
description: 'How the codebase is organized: stack, structure, data flow, layout'
---

# Architecture

Canutin is a SvelteKit + PocketBase personal finance application using Bun.

## Backend: PocketBase

- Dev server: `http://127.0.0.1:42070` by default, run with `bun run pb`, override with `PB_PORT`.
- Types are generated in `src/lib/pocketbase.schema.ts`.
- Custom Go hooks for balance calculations live in `pocketbase/main.go`.
- Core collections: accounts, transactions, assets, assetBalances, accountBalances, balanceTypes, transactionLabels, accountShares, assetShares, users.

## Frontend: SvelteKit with Svelte 5

Context stores live in `src/lib/*.svelte.ts`:

- `auth.svelte.ts` - authentication state
- `pocketbase.svelte.ts` - PocketBase client wrapper
- `accounts.svelte.ts` - account data with realtime updates
- `assets.svelte.ts` - asset tracking
- `transactions.svelte.ts` - transaction filtering and pagination
- `balance-types.svelte.ts` - chart of accounts types
- `cashflow.svelte.ts` - cashflow calculations

Route structure:

- `src/routes/(app)/` - protected routes that require auth
- `src/routes/(guest)/` - public routes, including auth pages

## i18n

- Paraglide JS via Inlang.
- Locales: English (`en`) and Spanish (`es`).
- Messages are imported from `$lib/paraglide/messages.js`.

## Commands

```bash
bun run quality   # Format + lint + type-check
bun run test      # Playwright E2E tests (desktop + mobile)
bun run build     # Production build
bun run pb        # PocketBase backend
```

Dev servers are owned by the user. Do not run `bun run dev`.
