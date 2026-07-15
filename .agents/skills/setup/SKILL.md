---
name: setup
description: Managed worktree creation, recovery, inspection, and safe removal
---

# Setup

## Control Plane

The checkout at the repository root is the primary worktree and control plane. Keep it on `next`; do feature work only in managed linked worktrees. `scripts/worktree.ts` discovers the primary checkout through Git, so its commands work from the primary checkout or any linked worktree.

Managed worktrees are nested under the ignored `/.worktrees/` directory:

> **Warning:** Never run double-force Git clean with ignored files from the primary checkout, such as `git clean -ffdx`. It can delete every nested managed checkout under `/.worktrees/`.

```text
<repo>/                              # primary worktree on next
└── .worktrees/
    ├── 01--feat-new-feature/        # feat/new-feature
    └── 02--fix-bug-123/             # fix/bug-123
```

The directory name is the slot padded to at least two digits, followed by `--` and a lowercase branch name with non-alphanumeric runs replaced by `-`.

## CLI

The package aliases map directly to `scripts/worktree.ts`:

| Command                                                                    | Behavior                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun run worktree:create <branch> [--base <base>]`                         | Create, reuse, or recover a managed worktree; the default base is `next` |
| `bun run worktree:list`                                                    | List managed worktrees and their status                                  |
| `bun run worktree:remove <branch\|slot\|path> [--force] [--delete-branch]` | Safely remove one managed worktree                                       |
| `bun run worktree:sweep`                                                   | Report removable merged, clean worktrees without changing them           |

`bun run worktree <command>` exposes the same `create`, `list`, `remove`, and `sweep` commands.

## Create

```bash
bun run worktree:create feat/new-feature
bun run worktree:create fix/bug-123 --base origin/next
```

The manager serializes concurrent creates, recovering an allocator lock left stale by a process that is no longer running, then chooses the lowest unoccupied slot whose deterministic port pair is available. Slots and ports are not user inputs:

- Vite and preview: `42069 + slot * 100`
- PocketBase: `42070 + slot * 100`

For example, slot 1 uses Vite port `42169` and PocketBase port `42170`. If a free slot's pair is already in use, creation continues to the next eligible slot in the same run.

For a new branch, the manager creates it from `next` or `--base`. If the local branch already exists but is not checked out, it checks out that branch and does not use the base. If the branch is already at its valid managed path, creation reuses a complete checkout or finishes interrupted initialization. It refuses to adopt the branch from an unmanaged or inconsistent path.

Initialization writes:

| File             | Generated content                                                         |
| ---------------- | ------------------------------------------------------------------------- |
| `.env`           | `VITE_PORT`, matching `VITE_PREVIEW_PORT`, `PB_PORT`, and `PUBLIC_PB_URL` |
| `.worktree.json` | Slot, branch, deterministic ports, and initialization state               |

It runs `bun install` between writing `.env` and marking `.worktree.json` initialized. Repeating the same create command recovers a valid partially initialized checkout.

## List

```bash
bun run worktree:list
```

Only directories under `/.worktrees/` with valid `.worktree.json` files are managed. The listing reports registration and branch consistency, clean or dirty state, commits not reachable from any remote, configured ports, and listeners. A listener is owned only when its process working directory is inside that worktree; listeners from other directories are reported as foreign.

## Work

Commands inside a managed worktree read its generated `.env`:

```bash
bun run pb
bun run dev
```

Do not edit the generated slot, ports, or worktree config by hand.

## Remove

```bash
bun run worktree:remove feat/new-feature
bun run worktree:remove 1
bun run worktree:remove .worktrees/01--feat-new-feature
```

The identifier may be a branch, slot, managed directory name, or path. By default removal keeps the local branch and refuses a dirty worktree or commits not reachable from any remote. `--force` overrides those two worktree-removal checks; a merged GitHub PR whose recorded head exactly matches the worktree head also protects otherwise unpushed commits.

Add `--delete-branch` to delete the local branch after removing the worktree. Branch deletion requires the exact reviewed worktree head to be either an ancestor of local `next` or the head of a merged GitHub PR. The manager rechecks that the branch still points to that exact commit before deletion and refuses to delete a branch that moved. `--force` does not bypass these requirements. Removal without `--delete-branch` does not require the branch to be merged, and the manager never deletes the remote branch.

Before removal, the manager sends `TERM` only to listeners whose working directory belongs to the worktree. After two seconds it sends `KILL` only to owned listeners still running. It leaves foreign listeners untouched and reports them.

## Sweep and Post-Merge Cleanup

`bun run worktree:sweep` makes no changes. It reports registered worktrees that are clean and whose exact head is merged into local `next` or belongs to a merged GitHub PR. A candidate with commits unreachable from remotes is reported only when exact merged-PR evidence protects that head. Active owned and foreign listeners are included in the report.

After merge:

1. Run `bun run worktree:sweep` to inspect eligible worktrees.
2. Run `bun run worktree:remove <branch|slot|path> --delete-branch` to stop owned processes, remove the worktree, and delete the proven-merged local branch.
3. Delete the remote branch separately if repository automation did not already do so.

If work is not merged, keep the worktree and branch unless explicitly choosing `--force` while preserving anything important elsewhere.

## See Also

- [verify](../verify/SKILL.md) - Local verification workflow
- [failure discipline](../failure-discipline/SKILL.md) - Error diagnosis rules
