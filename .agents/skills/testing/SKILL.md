---
name: testing
description: Playwright E2E tests (desktop + mobile), PocketBase seeding helpers, selectors, isolation, troubleshooting
---

# Testing Conventions

## Overview

E2E tests using Playwright, running on both desktop and mobile viewports, against a real local PocketBase backend. Prefer E2E tests over unit tests whenever a test can be meaningfully expressed as a user flow.

## Structure

| Location                    | Purpose                   |
| --------------------------- | ------------------------- |
| `e2e/*.test.ts`             | Test files                |
| `e2e/pocketbase.helpers.ts` | PocketBase test utilities |
| `e2e/playwright.helpers.ts` | UI navigation helpers     |
| `e2e/global.setup.ts`       | Global Playwright setup   |
| `playwright.config.ts`      | Playwright configuration  |

## Running Tests

```bash
bun run test                              # All tests (desktop + mobile)
bun run test -- -g 'test name'            # By name pattern
bun run test -- filename.test.ts          # Single file
bun run test --project=desktop            # Desktop only
bun run test --project=mobile             # Mobile only
```

## Playwright Projects

Defined in `playwright.config.ts`:

| Project   | Scope             | Viewport           |
| --------- | ----------------- | ------------------ |
| `desktop` | `e2e/*.test.ts`   | Desktop Chrome     |
| `mobile`  | `e2e/*.test.ts`   | iPhone 13 (WebKit) |

## Test Isolation

Every test starts fresh:

1. Call `resetDatabase()` in `beforeEach` when the test mutates shared state (deletes the users collection, cascading to everything owned by users)
2. **Use real name emails** via `seedUser('alice')`, `seedUser('bob')`, `seedUser('charlie')`, etc. — the helper suffixes a random 8-char id so emails are globally unique
3. Never use role-based emails like `owner@example.com` - always use real names
4. Never reuse names already used in other test files
5. Password is handled by helpers via `DEFAULT_PASSWORD` - never hardcode passwords

## Selector Priority

Use in this order (most to least preferred):

1. `getByText()` - Visible text
2. `getByLabel()` - Form labels
3. `getByRole()` - ARIA roles
4. `getByTestId()` - Last resort

## Assertions

- **Negative before positive** when checking state before an action
- **Never use explicit timeouts** - rely on Playwright's auto-waiting
- **Blank line after expect blocks** - separate action/expect groups with blank lines

```typescript
// Correct: blank lines only after expect blocks
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByText('Success')).toBeVisible();

await page.getByRole('link', { name: 'Next' }).click();
await expect(page).toHaveURL('/next');
```

## Test Utilities

See `e2e/pocketbase.helpers.ts` for the full list. Key functions:

- `resetDatabase()` — cascade-deletes all user-owned records
- `seedUser(name)` — creates a user, returns the record (with generated email)
- `getUserPB(email)` — returns a `TypedPocketBase` authenticated as that user
- `seedAccount({ owner, ... })`, `seedAssetBalance(...)`, `seedTransaction(...)`, etc.

UI helpers live in `e2e/playwright.helpers.ts`. Key functions:

- Login helpers that fill the auth form using `DEFAULT_PASSWORD`

## Anti-patterns

- **Never use `setTimeout`** or `waitForTimeout` - use assertions
- **Never hardcode waits** - Playwright auto-waits for elements
- **Never share state between tests** - each test is isolated
- **Never use `test.describe()` blocks** - keep tests flat for simplicity
- **Prefer adding assertions to existing tests** - test setup is expensive; add related checks to existing tests rather than creating new ones

## Troubleshooting

Port already in use (orphaned preview server):

```bash
lsof -ti:42069 | xargs kill -9   # Vite preview
lsof -ti:42070 | xargs kill -9   # PocketBase
```

In a worktree, check `.env` (or `.worktree.json` if the worktree scripts are in use) for the actual ports before killing.

## Seeding a User for QA

The user's preferred QA bootstrap is a one-liner that creates a basic user via the existing helpers:

```bash
bun -e "import('./e2e/pocketbase.helpers').then(m => m.seedUser('alice').then(u => console.log(u.email)))"
```

Use the printed email with `DEFAULT_PASSWORD` (`123qweasdzxc`) to log in.

## See Also

- [realtime.md](../realtime/SKILL.md) - PocketBase subscription patterns
- [pocketbase.md](../pocketbase/SKILL.md) - Backend API access
- [code-quality.md](../code-quality/SKILL.md) - TypeScript and style rules
