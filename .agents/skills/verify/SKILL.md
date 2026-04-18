---
name: verify
description: Local verification workflow - quality checks, running Playwright tests against local PocketBase
---

# Verify

## Overview

Before handing work off (see [deliver.md](../deliver/SKILL.md)), verify against local PocketBase and the local SvelteKit preview. Canutin has no preview-deployment system; all verification is local.

## Local Servers

PocketBase and Vite dev are always running in the background. Do not start them. In a worktree, they run on the ports from the worktree's `.env` (or `.worktree.json` if the worktree scripts created it):

- Vite dev — default `:5173`, overridable via `VITE_PORT`
- Vite preview — default `:42069`, overridable via `VITE_PREVIEW_PORT` (falls back to `VITE_PORT`)
- PocketBase — default `:42070`, overridable via `PB_PORT` (`PUBLIC_PB_URL` points the client at the same host)

Check the worktree's `.env` for the actual numbers before curling or opening a browser.

## Quality Check

```bash
bun run quality
```

This runs Prettier, ESLint, and svelte-check. Resolve all errors before committing. On a fresh worktree, run `bunx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` once if svelte-check can't find `$lib/paraglide/messages` — the Vite plugin normally generates this during dev/build.

## Running Tests

```bash
bun run test --project=desktop -- e2e/your-test.test.ts
bun run test --project=mobile  -- e2e/your-test.test.ts
```

Both projects are required before pushing. See [testing.md](../testing/SKILL.md) for conventions.

## QA Bootstrap

When the user wants to manually QA a feature in the browser, seed a basic user first:

```bash
bun -e "import('./e2e/pocketbase.helpers').then(m => m.seedUser('alice').then(u => console.log(u.email)))"
```

Use the printed email with `DEFAULT_PASSWORD` (`123qweasdzxc`) to log in.

## Reset When Needed

```bash
bun run pb:reset
```

Wipes the PocketBase dev database. The superuser (`superadmin@example.com` / `123qweasdzxc`) is re-upserted automatically on the next `bun run pb` start.

## See Also

- [testing.md](../testing/SKILL.md) - Playwright conventions
- [deliver.md](../deliver/SKILL.md) - PR handoff
- [failure-discipline.md](../failure-discipline/SKILL.md) - What to do when something fails
