---
name: local-servers
description: Local server ownership, ports, start/stop rules, and publishing Canutin to the tailnet
---

# Local servers

## Ownership

In a checkout under `/.worktrees/` the slot's servers are yours: start, stop, and restart them as the work needs, following the fleet `worktree-dev` skill. Everywhere else, and for any listener whose process cwd is another checkout, the listener is the user's. Reuse it if healthy and never stop it.

Playwright starts and stops its own PocketBase. Stop this checkout's manual server before running tests; Playwright requires the port to be free so it can use its test build and fake Plaid configuration.

## Ports and commands

Read ports from the checkout's generated `.env`, as described in [setup](../setup/SKILL.md). `PB_PORT` defaults to `42070`; this serves the built app, API, and admin UI. `VITE_PORT` selects the optional Vite development server, which defaults to `5173` outside worktrees.

```bash
bun run dev       # PocketBase plus Vite with hot reload and an API/admin proxy
bun run build     # Static frontend in build/
bun run preview   # PocketBase serving the built frontend
bun run pb        # PocketBase with schema type generation and demo enabled
bun run pb:reset  # Wipe the PocketBase dev database
```

## Publishing for another device

`dev-link PORT` proxies a loopback port to `https://<host>.ts.net:PORT` and prints that URL. Publish one port. For QA of the built app:

```bash
set -a; source .env; set +a
bun run build
bun run preview &
dev-link "$PB_PORT"
```

For hot reload, run `bun run dev` and publish `VITE_PORT` instead. Its API proxy keeps requests on the same public origin. Vite listens on `127.0.0.1` with strict ports and accepts `.ts.net` hosts. `worktree-done` unpublishes the slot's ports.
