---
name: local-servers
description: Local server ownership, ports, and start/stop rules for Vite and PocketBase
---

# Local Servers

## Ownership

Assume every existing local listener - Vite dev, Vite preview, PocketBase - belongs to the user: reuse a healthy listener, never stop or replace one you didn't start. Agents may start servers from the active worktree when explicitly requested; track any process you start, and stop only processes the current agent started and tracked. Exception: a Playwright preview server lingering from a crashed test run may be killed only if the current agent started that run - otherwise report the port conflict.

Managed-worktree removal has its own listener-ownership safeguards - see the [setup skill](../setup/SKILL.md).

## Ports

Every checkout runs on its own ports. A managed worktree generates an `.env` that sets them to its slot's deterministic pair (see [setup](../setup/SKILL.md)); without one, these defaults apply:

- Vite dev — `:5173`, set by `VITE_PORT`
- Playwright's preview server — `:42069`, set by `VITE_PREVIEW_PORT` (falls back to `VITE_PORT`); `bun run test` starts and stops it, no agent ever does
- PocketBase — `:42070`, set by `PB_PORT` (`PUBLIC_PB_URL` points the client at the same host)

Read the actual ports from the checkout's `.env` (or `.worktree.json` if the worktree scripts created it) before curling or opening a browser:

```bash
set -a; source .env; set +a
```

## Commands

```bash
bun run dev       # Vite dev server
bun run pb        # PocketBase (compiles the Go binary on first run)
bun run pb:reset  # Wipe the PocketBase dev database
```
