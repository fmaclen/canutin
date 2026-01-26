# AGENTS.md

SvelteKit + PocketBase personal finance application using Bun.

## Quick Start

- **Package manager:** Bun (`bun install`, `bun run`, `bunx`)
- **Quality check:** `bun run quality` (run before committing)
- **Dev servers:** Always running - don't start them
- **Go 1.21+:** Required to build PocketBase binary (first run compiles it)

## Specs

Load specs relevant to your task:

| Task                      | Spec                                                       |
| ------------------------- | ---------------------------------------------------------- |
| Writing Svelte components | [svelte5.md](./specs/conventions/svelte5.md)               |
| Writing tests             | [testing.md](./specs/conventions/testing.md)               |
| Code style & commits      | [code-quality.md](./specs/conventions/code-quality.md)     |
| Reviewing code            | [code-review.md](./specs/conventions/code-review.md)       |
| PocketBase realtime       | [realtime.md](./specs/conventions/realtime.md)             |
| Calling PocketBase API    | [pocketbase-api.md](./specs/conventions/pocketbase-api.md) |

## Architecture

### Backend: PocketBase

- Dev server: `http://127.0.0.1:42070` (run with `bun run pb`)
- Types auto-generated in `src/lib/pocketbase.schema.ts`
- Custom Go hooks for balance calculations: `pocketbase/main.go`
- Collections: accounts, transactions, assets, assetBalances, accountBalances, balanceTypes, transactionLabels, users

### Frontend: SvelteKit with Svelte 5

Context stores in `src/lib/*.svelte.ts`:

- `auth.svelte.ts` - Authentication state
- `pocketbase.svelte.ts` - PocketBase client wrapper
- `accounts.svelte.ts` - Account data with real-time updates
- `assets.svelte.ts` - Asset tracking
- `transactions.svelte.ts` - Transaction filtering/pagination
- `balance-types.svelte.ts` - Chart of accounts types
- `cashflow.svelte.ts` - Cashflow calculations

Route structure:

- `src/routes/(app)/` - Protected routes (requires auth)
- `src/routes/(guest)/` - Public routes (auth pages)

### i18n

- Paraglide JS via Inlang
- Locales: English (en), Spanish (es)
- Messages: `$lib/paraglide/messages.js`

## Commands

```bash
# Development
bun run dev              # Vite dev server (port 5173)
bun run pb               # PocketBase backend (port 42070)
bun run pb:reset         # Reset dev database

# Quality
bun run quality          # Format + lint + type-check
bun run test             # Playwright E2E tests

# Build
bun run build            # Production build
bun run preview          # Preview build (port 4173)
```

## Branches & PRs

- **Branch naming:** `{issue-number}-{short-description}`
- **Base branch:** `next` for v2 features
- **PR title:** `type: description` (semantic versioning)
- **PR body:** Short, include `Closes #123`

## Notes

- PocketBase v0.35.0 is automatically built from source and managed by scripts (custom Go hooks in `pocketbase/main.go`)
- Version is pinned in `pocketbase/go.mod` - update periodically to stay current with PocketBase releases
- Frozen lockfile (`bun.lock`) ensures reproducible builds
- All dependencies should be devDependencies (SvelteKit bundles everything at build time)
