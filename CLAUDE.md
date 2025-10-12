# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CanutinX is a personal finance management application built with SvelteKit 2 and PocketBase. It uses Svelte 5 with runes for reactivity, Bun as the runtime, and Playwright for end-to-end testing.

## Essential Commands

### Development

- `bun run dev` - Start Vite dev server
- `bun run pb` - Start PocketBase backend (required for development)
- `bun run pb:reset` - Reset the dev PocketBase database
- `bun run pb:import temp/Canutin.demo.vault` - Import demo data

### Testing & Quality

- `bun run test` - Run all Playwright e2e tests (starts PocketBase + preview automatically)
- `bun run check` - Type-check with svelte-check
- `bun run check:watch` - Type-check in watch mode
- `bun run lint` - Run Prettier check + ESLint
- `bun run format` - Auto-format with Prettier
- `bun run quality` - Format, lint, and type-check (run before commits/PRs)

### Build & Deploy

- `bun run build` - Production build
- `bun run preview` - Preview production build

## Architecture

### Backend: PocketBase

- Local development server runs on `http://127.0.0.1:42070` (configured in `scripts/pb-server.ts`)
- Schema and TypeScript types are defined in `src/lib/pocketbase.schema.ts`
- All database interactions use typed PocketBase client via context API
- Real-time subscriptions are used for live updates (see accounts and balance contexts)

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

- `auth.svelte.ts` - Authentication state and methods
- `pocketbase.svelte.ts` - PocketBase client wrapper
- `accounts.svelte.ts` - Account data with real-time balance updates
- `transactions.svelte.ts` - Transaction filtering and pagination
- `assets.svelte.ts` - Asset tracking
- `balance-types.svelte.ts` - Chart of accounts type definitions

#### Svelte 5 Runes (IMPORTANT)

This project uses Svelte 5's runes syntax exclusively. Key patterns:

- **State**: `let count = $state(0)` - Works for primitives, objects, and arrays
- **Derived**: `const doubled = $derived(count * 2)` - Auto-tracks dependencies
- **Effects**: `$effect(() => { console.log(count); })` - Replaces `onMount`/`onDestroy`
- **Props**: `let { id = '', onSelect } = $props()` - Use destructuring with defaults
- **Events**: Use `onclick={...}` not `on:click={...}` (applies to all DOM events)
- **Children**: Access via `$props.children` and render with `{@render children?.()}`

See AGENTS.md lines 30-41 for complete runes reference.

#### Route Structure

- `src/routes/(app)/` - Protected app routes (requires auth)
- `src/routes/(guest)/` - Public routes (auth pages)
- `src/routes/auth-guard.svelte` - Handles authentication routing

### UI Components

- Built with bits-ui (headless components) and styled with Tailwind CSS v4
- Custom components in `src/lib/components/` (domain-specific, e.g., `currency.svelte`, `key-value.svelte`)
- UI primitives in `src/lib/components/ui/` (shadcn-style components)
- Uses layerchart for data visualization

### Testing Strategy

- Framework: Playwright with fixtures in `e2e/playwright.helpers.ts` and `e2e/pocketbase.helpers.ts`
- Global setup: `e2e/global.setup.ts` initializes test environment
- Test organization mirrors route structure (e.g., `e2e/transactions.test.ts` tests `/transactions` page)
- Selector preference (in order): `getByText`, `getByLabel`, `getByRole`, and as last resort `getByTestId`
- Avoid shared state: use unique person names for test emails (e.g., `alice@example.com`, `bob@example.com`) for easier debugging; avoid repeating already used names
- Add negative assertions before positives to catch false positives

## Code Style

### TypeScript

- Strict mode enabled with `"any"` forbidden
- Explicit parameter and export types required; rely on inference for return types
- Context stores use class-based patterns with private methods/properties

### Formatting

- Prettier config: tabs (width 2), single quotes, line width 100, no trailing commas
- Files follow SvelteKit conventions: `+page.svelte`, `+layout.ts`, `+server.ts`
- Component files use kebab-case: `card-title.svelte`, `section-title.svelte`

### Internationalization

- Uses Paraglide JS (via Inlang) for i18n
- Messages accessed via `$lib/paraglide/messages.js` (e.g., `m.auth_login_failed()`)
- Configuration in `project.inlang/`

## Development Workflow

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
```

### Optional: Import Demo Data

```bash
bun run pb:import temp/Canutin.demo.vault
```

### Before Committing

Always run: `bun run quality && bun run test`

## Key Files

- `src/lib/pocketbase.schema.ts` - PocketBase collections and type definitions
- `src/routes/(app)/+layout.svelte` - App-level context initialization
- `AGENTS.md` - Detailed coding guidelines and conventions (reference for complex patterns)
- `playwright.config.ts` - Test configuration with desktop/mobile projects
