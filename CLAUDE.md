# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CanutinX is a personal finance management application built with SvelteKit 2 and PocketBase. It uses Svelte 5 with runes for reactivity, Bun as the runtime, and Playwright for end-to-end testing.

## Essential Commands

### Development

- `bun run dev` - Start Vite dev server on port 5173
- `bun run pb` - Start PocketBase backend on port 42070 (required for development)
- `bun run pb:reset` - Reset the dev PocketBase database
- `bun run pb:import temp/Canutin.demo.vault` - Import demo data from Canutin v1 vault format

### Testing & Quality

- `bun run test` - Run all Playwright e2e tests (starts PocketBase + preview automatically)
- `bun run check` - Type-check with svelte-check
- `bun run check:watch` - Type-check in watch mode
- `bun run lint` - Run Prettier check + ESLint
- `bun run format` - Auto-format with Prettier
- `bun run quality` - Format, lint, and type-check (run before commits/PRs)

### Build & Deploy

- `bun run build` - Production build
- `bun run preview` - Preview production build on port 4173

## Architecture

### Backend: PocketBase

- Local development server runs on `http://127.0.0.1:42070` (configured in `scripts/pb-server.ts`)
- Schema and TypeScript types are auto-generated in `src/lib/pocketbase.schema.ts` via pocketbase-typegen
- All database interactions use typed PocketBase client via context API
- Real-time subscriptions are used for live updates (see accounts and balance contexts)
- Collections: accounts, transactions, assets, assetBalances, accountBalances, balanceTypes, transactionLabels, users

### Frontend: SvelteKit with Svelte 5

#### Svelte Context Pattern

The app heavily uses Svelte's context API for state management. Context stores are created in `src/lib/*.svelte.ts` files and initialized in layout components:

1. **Root layout** (`src/routes/+layout.svelte`):
   - Initializes `PocketBaseContext` and `AuthContext`
   - Provides authentication guard

2. **App layout** (`src/routes/(app)/+layout.svelte`):
   - Initializes `BalanceTypesContext`, `AccountsContext`, and `AssetsContext`
   - These contexts depend on the PocketBase client from root layout

Key context stores:

- `auth.svelte.ts` - Authentication state and methods (class-based pattern)
- `pocketbase.svelte.ts` - PocketBase client wrapper
- `accounts.svelte.ts` - Account data with real-time balance updates
- `transactions.svelte.ts` - Transaction filtering and pagination
- `assets.svelte.ts` - Asset tracking
- `balance-types.svelte.ts` - Chart of accounts type definitions
- `cashflow.svelte.ts` - Cashflow calculations

#### Svelte 5 Runes (IMPORTANT)

This project uses Svelte 5's runes syntax exclusively. See [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide) for complete documentation.

**Core Runes:**

- **State**: `let count = $state(0)` - Reactive variables (replaces top-level `let` declarations)
  ```typescript
  let count = $state(0);
  let user = $state({ name: 'Alice' });  // Works with objects/arrays
  ```

- **Derived**: `let doubled = $derived(count * 2)` - Computed values (replaces `$:` reactive declarations)
  ```typescript
  let doubled = $derived(count * 2);
  ```

- **Effects**: Side effects and lifecycle (replaces `onMount` and `onDestroy`)
  ```typescript
  $effect(() => {
    console.log('count changed:', count);
    // Cleanup function (replaces onDestroy)
    return () => {
      console.log('cleanup');
    };
  });
  ```

- **Props**: Component props (replaces `export let`)
  ```typescript
  let { id = '', onSelect } = $props();  // With defaults
  ```

**Event Handling:**
- Use standard DOM properties: `onclick={handler}` instead of `on:click={handler}`

**Snippets & Content Passing:**
- Default children available as snippet via `$props.children`
  ```typescript
  let { children } = $props();
  {@render children?.()}
  ```

- Named snippets replace named slots:
  ```typescript
  // Parent component
  <Child>
    {#snippet header()}
      <h1>Header content</h1>
    {/snippet}
  </Child>

  // Child component
  let { header, children } = $props();
  {@render header?.()}
  {@render children?.()}
  ```

See AGENTS.md lines 30-41 for additional patterns.

#### Route Structure

- `src/routes/(app)/` - Protected app routes (requires auth)
- `src/routes/(guest)/` - Public routes (auth pages)
- `src/routes/auth-guard.svelte` - Handles authentication routing

### UI Components

- Built with bits-ui (headless components) and styled with Tailwind CSS v4
- Custom components in `src/lib/components/` (domain-specific, e.g., `currency.svelte`, `key-value.svelte`)
- UI primitives in `src/lib/components/ui/` (shadcn-style components)
- Uses layerchart for data visualization (D3-based)
- Icons from @lucide/svelte

### Testing Strategy

- Framework: Playwright with fixtures in `e2e/playwright.helpers.ts` and `e2e/pocketbase.helpers.ts`
- Global setup: `e2e/global.setup.ts` initializes test environment
- Test organization mirrors route structure (e.g., `e2e/transactions.test.ts` tests `/transactions` page)
- Browsers tested: Desktop (Chromium) and Mobile (WebKit - iPhone 13)
- Selector preference (in order): `getByText`, `getByLabel`, `getByRole`, and as last resort `getByTestId`
- Avoid shared state: use unique person names for test emails (e.g., `alice@example.com`, `bob@example.com`) for easier debugging; avoid repeating already used names
- Add negative assertions before positives to catch false positives
- **Timeouts**: Never use explicit timeouts in Playwright tests except in extremely rare cases. Rely on Playwright's default timeouts. If you need to wait for something, use positive or negative assertions instead.
- CI retries: 2 retries enabled in CI, disabled locally

## Code Style

### TypeScript & Type Safety Standards

- Strict mode enabled
- **Never use `any` type** - Always define proper types or use `unknown` if type is truly unknown
- **Avoid explicit return types** - Let TypeScript infer return types (better for refactoring)
- **Explicit parameter and export types required**
- **Never disable linter rules** - Fix the underlying issue instead of suppressing warnings
- **Resolve type errors properly** - Don't use `@ts-ignore` or `@ts-expect-error`
- **Use proper type narrowing** - Use type guards instead of type assertions when possible
- Context stores use class-based patterns with private methods/properties

### Formatting

- Prettier config: tabs (width 2), single quotes, line width 100, no trailing commas
- Files follow SvelteKit conventions: `+page.svelte`, `+layout.ts`, `+server.ts`
- Component files use kebab-case: `card-title.svelte`, `section-title.svelte`

### Import Organization

Sort order (handled by Prettier):
1. Built-in modules
2. Third-party modules
3. `$env/*` aliases
4. `$app/*` aliases
5. `$lib/*` aliases
6. Relative imports

### Internationalization

- Uses Paraglide JS (via Inlang) for i18n
- Locales: English (en), Spanish (es)
- Messages accessed via `$lib/paraglide/messages.js` (e.g., `m.auth_login_failed()`)
- Configuration in `project.inlang/settings.json`
- Message files in `messages/{locale}.json`

## Development Workflow

### Development Standards

- **Never mention Claude Code** - Don't reference AI tools in commit messages, comments, or documentation
- **Never add co-contributors** - Don't add `Co-Authored-By` or similar tags to commits
- **Use semantic commit messages** - Format: `type: description` (e.g., `feat: add user authentication`, `fix: resolve database connection issue`)
- **Avoid adding comments** - Only add comments when explicitly requested by the user
- **Never run dev automatically** - Always assume the user is running dev server in a separate terminal

### Background Processes

Developers typically run these processes constantly in separate terminals:

- `bun run pb` - PocketBase backend (required for dev and manual testing)
- `bun run dev` - Vite dev server

**Important**: Always ask the user to start these processes if needed. Do not attempt to run them automatically as they are long-running background services.

### Running Tests

Playwright test filtering examples:

```bash
bun run test -- -g 'name of test'            # Run tests with names matching the string
bun run test -- name-of-test-file            # Run all tests in files matching partial name
bun run test -- name-of-test-file.test.ts    # Run all tests in the specified file
bun run test --project=desktop               # Run all tests on desktop project only
bun run test --project=mobile                # Run all tests on mobile project only
```

### Optional: Import Demo Data

```bash
bun run pb:import temp/Canutin.demo.vault
```

### Before Committing

Always run: `bun run quality && bun run test`

## Key Files

- `src/lib/pocketbase.schema.ts` - PocketBase collections and type definitions (auto-generated)
- `src/routes/(app)/+layout.svelte` - App-level context initialization
- `AGENTS.md` - Detailed coding guidelines and conventions (reference for complex patterns)
- `playwright.config.ts` - Test configuration with desktop/mobile projects
- `scripts/pb-server.ts` - PocketBase server management script
- `docker-compose.yml` - Docker Compose setup for deployment

## CI/CD

- GitHub Actions workflows in `.github/workflows/`
- Semantic Release configured for `master` and `next` branches
- Docker deployment with multi-stage Bun-based build
- App runs on port 42069, PocketBase on port 42070 in production

## Notes

- Avoid defining return types, use type inference as much as possible
- PocketBase v0.30.0 is automatically downloaded and managed by scripts
- Frozen lockfile (`bun.lock`) ensures reproducible builds