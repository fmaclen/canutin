---
name: local-servers
description: Local server ownership, ports, and start/stop rules for Vite and PocketBase
---

# Local Servers

## Ownership

Assume every existing local listener - Vite dev, Vite preview, PocketBase - belongs to the user: reuse a healthy listener, never stop or replace one you didn't start. Agents may start servers from the active worktree when explicitly requested; track any process you start, and stop only processes the current agent started and tracked. Exception: a Playwright preview server lingering from a crashed test run may be killed only if the current agent started that run - otherwise report the port conflict.

Managed-worktree removal has its own listener-ownership safeguards - see the [setup skill](../setup/SKILL.md).

## Ports

- Vite dev — default `:5173`, overridable via `VITE_PORT`
- Vite preview — default `:42069`, overridable via `VITE_PREVIEW_PORT` (falls back to `VITE_PORT`)
- PocketBase — default `:42070`, overridable via `PB_PORT` (`PUBLIC_PB_URL` points the client at the same host)

In a managed worktree, read the actual ports from the worktree's `.env` (or `.worktree.json` if the worktree scripts created it) before curling or opening a browser.

## Commands

```bash
bun run dev       # Vite dev server
bun run pb        # PocketBase (compiles the Go binary on first run)
bun run pb:reset  # Wipe the PocketBase dev database
```
