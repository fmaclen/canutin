---
name: architecture
description: 'How the codebase is organized: stack, structure, data flow, layout'
---

# Architecture

Canutin is a SvelteKit + PocketBase personal finance application using Bun.

## Backend: PocketBase

- Dev server URL, ports, and start commands: see [local-servers](../local-servers/SKILL.md).
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

Server ownership, ports, and start/stop rules live in the [local-servers skill](../local-servers/SKILL.md).
