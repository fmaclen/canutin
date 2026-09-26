---
name: local-servers
description: Local server ownership, ports, start/stop rules, and publishing Vite and PocketBase to the tailnet
---

# Local Servers

## Ownership

In a checkout under `/.worktrees/` the slot's servers are yours: start, stop, and restart them as the work needs (fleet `worktree-dev` skill). Everywhere else, and for any listener whose process cwd is another checkout, the listener is the user's: reuse it if healthy, never stop it. `bun run test` starts and stops its own preview server; one left behind by a test run you started may be killed.

## Ports

Read them from the checkout's `.env` (written by the worktree manager, see [setup](../setup/SKILL.md)); without one these defaults apply:

- Vite dev — `:5173`, `VITE_PORT`
- Playwright's preview server — `:42069`, `VITE_PREVIEW_PORT` (falls back to `VITE_PORT`)
- PocketBase — `:42070`, `PB_PORT`; `PUBLIC_PB_URL` is the URL the browser reaches it at

## Commands

```bash
bun run dev       # Vite dev server
bun run pb        # PocketBase (compiles the Go binary on first run)
bun run pb:reset  # Wipe the PocketBase dev database
```

## Publishing for another device

`dev-link PORT` proxies a loopback port to `https://<host>.ts.net:PORT` and prints that URL. The phone's browser reads `PUBLIC_PB_URL`, so publish PocketBase first and start Vite with its published URL:

```bash
set -a; source .env; set +a
bun run pb &
PUBLIC_PB_URL=$(dev-link "$PB_PORT") bun run dev &
dev-link "$VITE_PORT"   # the link to hand over
```

Vite listens on `127.0.0.1` with strict ports and accepts `.ts.net` hosts. `worktree-done` unpublishes both ports.
