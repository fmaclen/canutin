---
name: setup
description: Worktree creation, dependency install, environment initialization for autonomous work
---

# Setup

## Overview

Create an isolated worktree so you can work on an issue without interfering with the main repo or other worktrees running on the same machine. Each worktree gets its own branch, dependencies, `.env`, and port assignments.

## Worktree Layout

Worktrees are created as siblings of the main repo under a `worktrees/` directory:

```
<parent>/
├── canutin/                         # main repo (default ports, never touched by worktree setup)
└── worktrees/
    ├── worktree-1/                  # isolated worktree
    ├── worktree-2/
    └── worktree-3/
```

## Port Allocation

Each worktree gets 2 ports, dynamically allocated from free ports at setup time:

- **Vite** — both dev (`VITE_PORT`) and preview (`VITE_PREVIEW_PORT`, falls back to `VITE_PORT`)
- **PocketBase** — `PB_PORT`, with `PUBLIC_PB_URL` set to match

Ports are stored in `.worktree.json` and written as env vars into `.env`.

## Before Creating a Worktree

1. **List existing worktrees**:

   ```bash
   git worktree list
   ```

2. **Assess each numbered worktree**:
   - **Active** — dev servers listening on its ports (`lsof -i :<port> -t` using the `VITE_PORT` / `PB_PORT` from its `.env` or `.worktree.json`)
   - **Has uncommitted work** — `git -C <path> status --porcelain` shows output
   - **Has unpushed work** — `git -C <path> log origin/next..HEAD --oneline` shows commits
   - **Stale** — no running processes, no uncommitted changes, branch merged or matches base

3. **Decide**:
   - Already exists for the same branch → **reuse it**
   - Stale → **offer to tear it down** (`bun run worktree:teardown <N>`) and reuse the slot
   - All active → **pick the next available number**
   - Always tell the user what you found before proceeding

## Creating a Worktree

Run **from the main repo**:

```bash
bun run worktree:setup <number> <branch> [--base <base-branch>]
```

Examples:

```bash
bun run worktree:setup 1 feat/new-feature
bun run worktree:setup 2 fix/bug-123 --base origin/next
```

The script:

1. Scans existing worktrees and reports their state
2. Dynamically finds free ports for Vite and PocketBase
3. Creates the worktree via `git worktree add`
4. Writes `.env` with `VITE_PORT`, `PB_PORT`, `PUBLIC_PB_URL`
5. Writes `.worktree.json` with the worktree config (ports, branch, number)
6. Runs `bun install`
7. Prints agent-launch commands for each installed coding agent

## Starting a New Agent Session

After setup, the script prints ready-to-copy commands:

```
opencode <worktree-path> --prompt "task description"
codex -C <worktree-path> "task description"
cd <worktree-path> && claude
```

You must start a **new** agent session in the worktree directory. The existing session cannot change its working directory.

## Working in a Worktree

Start dev servers as normal — they read ports from `.env`:

```bash
bun run pb       # PocketBase on the worktree's PB_PORT
bun run dev      # SvelteKit on the worktree's VITE_PORT
```

Both commands pick up the correct ports automatically. No special flags needed.

## Seeding a User for QA

After PocketBase is up, seed a basic user for manual QA:

```bash
bun -e "import('./e2e/pocketbase.helpers').then(m => m.seedUser('alice').then(u => console.log(u.email)))"
```

Log in with the printed email and `DEFAULT_PASSWORD` (`123qweasdzxc`).

## Tearing Down a Worktree

```bash
bun run worktree:teardown <number>          # remove worktree, keep branch
bun run worktree:teardown <number> --prune  # remove worktree and delete branch
```

Teardown kills any processes on the worktree's ports and removes the git worktree.

## Key Files

| File             | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `.worktree.json` | Worktree number, port assignments, branch                      |
| `.env`           | `VITE_PORT`, `PB_PORT`, `PUBLIC_PB_URL` for this worktree only |

## Agent Behavior

- **DO** run `bun run worktree:setup` from the main repo before starting work
- **DO** tell the user to start a new agent session in the worktree directory
- **DO** use `bun run dev` and `bun run pb` as normal (ports are automatic)
- **DON'T** modify the main repo's env files or ports
- **DON'T** hardcode port numbers — always let `.env` drive them
- **DON'T** create worktrees outside the `worktrees/` sibling directory
- **DON'T** skip `bun install` — TypeScript LSP and ESLint need it

## After Finishing Work

- After a PR is merged:
  1. `bun run worktree:teardown <N> --prune` (removes worktree and local branch)
  2. `git push origin --delete <branch-name>` (removes remote branch)
- If the user is done but hasn't merged, leave the worktree and branches in place

## Troubleshooting

**Port conflict**: Re-run `bun run worktree:setup` — ports are dynamically allocated, a retry will find different free ports. Or kill the offender: `lsof -ti:<port> | xargs kill -9`.

**Missing env vars**: Re-run setup to re-write `.env` and `.worktree.json`.

**Paraglide messages missing** (svelte-check errors about `$lib/paraglide/messages`): `bunx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`. The Vite plugin usually handles this during dev/build.

## See Also

- [verify.md](../verify/SKILL.md) - Local verification workflow
- [failure-discipline.md](../failure-discipline/SKILL.md) - Error diagnosis rules
