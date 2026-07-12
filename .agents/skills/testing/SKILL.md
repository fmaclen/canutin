---
name: testing
description: 'How tests are organized, written, and run across tiers'
---

# Testing

## Preference order

Prefer real systems over mocks. Tests that exercise the actual stack - real PocketBase, real browser - give the most confidence. The same concern is never covered at more than one tier; if an E2E already proves a flow, do not add a unit test for the helper underneath it.

In order of preference:

1. **E2E** (`e2e/*.test.ts`) - UI-reachable flow exercised through Playwright against the real local PocketBase backend.
2. **API/backend tests** - backend behavior with no UI, real PocketBase through the test helpers. Add this tier only when the behavior has no useful UI surface.
3. **Unit tests** - pure logic with no DB. Only when none of the above apply.

Pick the most-preferred tier the behavior reaches. If a feature is UI-driven, write an E2E even when the bug is in backend-adjacent data code - the E2E proves the end-to-end fix and the lower-level code is covered transitively.

Playwright (`e2e/`) is the only test suite. The Go tests under `pocketbase/` are a narrow, justified exception reserved for behavior that cannot be provoked or observed through any surface Playwright reaches - currently the balance worker's serialization/locking (`balance_test.go`) and the FX fetcher's outbound-response classification against stubbed transports (`rates_test.go`). Each such file carries a top-of-file justification comment explaining why the behavior is unreachable from Playwright, and they run in CI through the Tests workflow alongside the Playwright run. Never add a Go test for behavior a Playwright test could cover.

Top-level commands:

```bash
bun run test                         # All Playwright tests (desktop + mobile)
bun run test -- e2e/file.test.ts     # Single file - desktop and mobile in one run
bun run test -- -g 'test name'       # By name pattern
```

## E2E

### When to write

A new user-visible behavior, a bug that surfaces in the UI, or a flow that an API/backend test cannot prove (layout interaction, navigation, auth redirects, realtime UI behavior).

### Patterns

Read existing nearby tests before writing a new file. Copy the shape, not the quirks. Understand why a pattern exists before reusing it.

Key rules:

- Use the helpers in [`e2e/playwright.helpers.ts`](../../../e2e/playwright.helpers.ts) for navigation and auth.
- **Reach every page through the UI a real user clicks** - sidebar links, table row links, tabs, view-all links, form redirects. This happy path is mandatory, not "when practical". The navigation helpers (`goToPageViaSidebar`, `goToRecordDetail`, `goToEditTab`, `goToAddPage`) are the happy-path primitives - use them instead of hand-rolling navigation. Any `goto` a helper owns internally is already justified in the helper.
- **`page.goto()` in a spec is a code-review block** unless it has a genuinely good reason. The only sanctioned reasons:
  - The app entry point at the start of a session (`goto('/')`, or a sign-in/start page — including a fresh sign-in mid-test after signing out or clearing cookies) — needs no justification comment.
  - Intentionally visiting a broken or direct URL the UI never links to (404 pages, auth-guard redirect checks).
  - A test whose explicit purpose is direct-URL behavior (URL-param initialization, deep-link handling).

  Every kept mid-test `goto` carries a one-line justification comment directly above it. Navigation-only changes never weaken or change what a test asserts.

- Use the helpers in [`e2e/pocketbase.helpers.ts`](../../../e2e/pocketbase.helpers.ts) for seeding (`resetDatabase`, `seedUser`, `getUserPB`, `seedAccount`, `seedTransaction`, `seedAssetBalance`).
- Reset shared state with `resetDatabase()` in `beforeEach` when the test mutates shared state.
- Real-name users: `alice`, `bob`, `charlie`. Never role-based names like `owner` unless the UI text itself requires that role.
- Never reuse names already used in other test files when the helper derives globally unique emails from the name.
- Keep tests flat - no `test.describe` blocks.
- Add assertions to existing tests when possible; test setup is expensive.

### Selectors

In order of preference: `getByText` (visible text) -> `getByLabel` (form labels) -> `getByRole` (ARIA roles) -> `getByTestId` (last resort).

### Assertions

- **Negative before positive** when checking state around an action: assert the not-yet state, take the action, assert the after state.
- Use `await expect(locator).toBeVisible()` to wait. Playwright auto-waits - never `setTimeout`, never `waitForTimeout`.
- **No preventive custom timeouts.** Playwright's defaults are correct for almost everything. A `{ timeout: N }` argument is only acceptable when (a) a real run has actually failed without it and (b) the line carries a `// HACK:` comment naming what is slow and why no other fix is feasible. Adding a timeout "to be safe" before any failure has been observed is a code-review block.
- **Block grouping.** A block is consecutive actions followed by the expects that verify them. Blank lines separate blocks; never inside a block - not between consecutive actions, not between consecutive expects in the same block.

```typescript
// Correct: blank line only between action/expect blocks
await login(page, alice.email);
await page.getByRole('link', { name: 'Transactions' }).click();
await expect(page.getByText('Transactions')).toBeVisible();

await page.getByRole('button', { name: 'Add transaction' }).click();
await expect(page.getByRole('dialog')).toBeVisible();
```

### Running

Defaults - what you want before pushing:

```bash
bun run test                         # All E2E
bun run test -- e2e/file.test.ts     # Single file - desktop and mobile in one run
bun run test -- -g 'test name'       # By name pattern
```

Debug variants (single browser, faster loop while iterating):

```bash
bun run test -- e2e/file.test.ts --project=desktop
bun run test -- e2e/file.test.ts --project=mobile
```

Flake check - use Playwright's repeater, never a shell loop:

```bash
bun run test -- e2e/file.test.ts --repeat-each=10
```

### Never run two test commands at once

Wait for each test run to finish before starting the next. Two test commands running at the same time fight over the same backend and preview server and produce false flake. To run several files together, pass them to a single Playwright invocation instead of launching multiple processes.

If a previous run ended early (Ctrl-C, killed terminal, crashed reporter) the preview server may linger and the next run will fail to bind. Killing a preview server is always safe - preview only exists to serve tests. Never kill a dev server or backend server; the user owns those.

### Local verification before push

Run one or two targeted smoke tests related to the change before pushing - never the full file when a focused `-g` pattern covers the behavior you actually touched. CI will run the whole suite; your job locally is to catch the obvious regression cheaply.

```bash
bun run test -- -g 'name of the test you care about'
```

## Seeding a user for QA

The user's preferred QA bootstrap is a one-liner that creates a basic user via the existing helpers:

```bash
bun -e "import('./e2e/pocketbase.helpers').then(m => m.seedUser('alice').then(u => console.log(u.email)))"
```

Use the printed email with `DEFAULT_PASSWORD` (`123qweasdzxc`) to log in.

## Code quality in tests

Test code follows the same rules as production code (see [code-quality](../code-quality/SKILL.md)). Most-violated in tests:

- No `any` - use proper types.
- No explicit return types - let TypeScript infer.
- No unused imports or variables.
- Sentence case for UI-text assertion strings.

## Troubleshooting

- **Preview server port already in use** - Playwright's preview server lingered from a previous run that ended early. Kill it and rerun after checking the port in `.env` or `.worktree.json`. Preview servers are always safe to kill. Never apply this to a dev or backend server - those belong to the user.
- **PocketBase port already in use** - check `.env` or `.worktree.json` for the actual `PB_PORT`. Do not kill the user's main dev backend.
- **Generated messages missing** - run the relevant quality/build command so Paraglide regenerates output; do not hand-edit generated files.
