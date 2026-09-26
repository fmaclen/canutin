---
name: setup
description: Worktrees - T3 attaches one per thread; create, list, remove, and sweep by hand
---

# Setup

The checkout at the repository root is the primary worktree. Keep it on `master`; feature work happens in worktrees under the ignored `/.worktrees/`. `scripts/worktree.ts` finds the primary checkout through Git, so its commands work from any checkout.

> **Warning:** Never run `git clean -ffdx` from the primary checkout: it deletes every checkout under `/.worktrees/`.

## T3 flow

T3 opens each thread in `.worktrees/<branch>` and runs `scripts/worktree-setup` (wired in `t3.json`), which is `bun run worktree:attach`: it adopts the git worktree at `T3CODE_WORKTREE_PATH` (or the cwd), takes the lowest free slot, writes `.env` and `.worktree.json`, and runs `bun install`. Rerunning keeps the slot. The fleet `worktree-dev` skill covers ownership, the tailnet link, and `worktree-done`, which retires the worktree.

## Slots and ports

A slot is claimed by a `.worktree.json`, never by a directory name. Ports follow from the slot and are not inputs:

- Vite dev and preview: `42069 + slot × 100`
- PocketBase: `42070 + slot × 100`

| File             | Content                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `.env`           | `VITE_PORT`, matching `VITE_PREVIEW_PORT`, `PB_PORT`, and `PUBLIC_PB_URL` |
| `.worktree.json` | Slot, branch, ports, initialization state                                 |

Do not edit either by hand.

## CLI

| Command                                                                    | Behavior                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run worktree:attach`                                                  | Adopt the git worktree at `T3CODE_WORKTREE_PATH` or the cwd; what T3 runs                                                                                                                    |
| `bun run worktree:create <branch> [--base <base>]`                         | Hand-made worktree at `.worktrees/NN--branch` from `master` or `--base`; a branch already checked out under `.worktrees/` is attached instead                                                |
| `bun run worktree:list`                                                    | Slot, branch, clean or dirty, unpushed commits, ports, listeners (owned when the process cwd is inside the worktree, foreign otherwise)                                                      |
| `bun run worktree:remove <branch\|slot\|path> [--force] [--delete-branch]` | Stops owned listeners and removes the worktree; refuses dirty or unpushed without `--force`; `--delete-branch` needs the exact head merged into `master` or a merged PR, and is never forced |
| `bun run worktree:sweep`                                                   | Report clean, merged worktrees ready for `remove`; changes nothing                                                                                                                           |

`attach` and `create` serialize on a lock that recovers from a dead process.
