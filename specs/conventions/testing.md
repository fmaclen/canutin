# Testing Conventions

## Overview

E2E tests using Playwright, running on both desktop and mobile viewports.

## Structure

| Location                    | Purpose                   |
| --------------------------- | ------------------------- |
| `e2e/*.test.ts`             | Test files                |
| `e2e/pocketbase.helpers.ts` | PocketBase test utilities |
| `e2e/playwright.helpers.ts` | UI navigation helpers     |
| `playwright.config.ts`      | Playwright configuration  |

## Running Tests

```bash
bun run test                              # All tests (desktop + mobile)
bun run test -- -g 'test name'            # By name pattern
bun run test -- filename.test.ts          # Single file
bun run test --project=desktop            # Desktop only
bun run test --project=mobile             # Mobile only
```

## Test Isolation

Every test starts fresh:

1. Use unique person names for emails: `alice@example.com`, `bob@example.com`, `charlie@example.com`
2. Never use role-based emails like `owner@example.com` - always use real names
3. Never reuse names already used in other test files
4. Password is handled by test helpers via `DEFAULT_PASSWORD` - never hardcode passwords

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

## Anti-patterns

- **Never use `setTimeout`** or `waitForTimeout` - use assertions
- **Never hardcode waits** - Playwright auto-waits for elements
- **Never share state between tests** - each test is isolated
- **Never use `test.describe()` blocks** - keep tests flat for simplicity
- **Prefer adding assertions to existing tests** - test setup is expensive; add related checks to existing tests rather than creating new ones

## Troubleshooting

Port 4173 in use (orphaned preview server):

```bash
lsof -ti:4173 | xargs kill -9
```

## See Also

- [realtime.md](./realtime.md) - PocketBase subscription patterns
