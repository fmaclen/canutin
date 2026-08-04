# Canutin

Canutin is a personal finance application: SvelteKit on the frontend, PocketBase for the backend and database, and Bun for local tooling.

> This file is `AGENTS.md`. `CLAUDE.md` is a symlink to it - edit `AGENTS.md`.

Feature work happens in managed worktrees under `/.worktrees/` - see the [setup skill](./.agents/skills/setup/SKILL.md).

## Skills

Each skill lives at `.agents/skills/<slug>/SKILL.md`. Read the ones that match the files you are about to touch, before you touch them:

- `code-quality` on every change.
- `svelte5` for any `.svelte` or `.svelte.ts` file.
- `testing` for anything under `e2e/`, and for any work that adds or changes tests.
- `pocketbase` for PocketBase collections, hooks, migrations, the generated schema, and anything under `pocketbase/`.
- `failures-and-logs` for error surfaces: try/catch boundaries, user-visible failure messages, server logging.

### Context

| Synopsis                                                                  | Slug         |
| ------------------------------------------------------------------------- | ------------ |
| How the codebase is organized: stack, structure, data flow, layout        | architecture |
| How authentication works across environments and how routes are protected | auth-system  |
| How PocketBase, Go hooks, generated types, and backend access work        | pocketbase   |
| How PocketBase realtime subscriptions are set up and cleaned up           | realtime     |
| How code reaches each environment and what runs where                     | deployment   |

### Conventions

| Synopsis                                                                 | Slug              |
| ------------------------------------------------------------------------ | ----------------- |
| Code rules the linter doesn't catch: types, comments, structure, UI text | code-quality      |
| How failures throw, log, trace, and surface to users across the stack    | failures-and-logs |
| Frontend writing conventions in this Svelte 5 codebase                   | svelte5           |
| Backend writing conventions in this PocketBase codebase                  | pocketbase        |
| How tests are organized, written, and run across tiers                   | testing           |
| How frontend design work should preserve and extend visual quality       | frontend-design   |

### Shipping

| Synopsis                                             | Slug            |
| ---------------------------------------------------- | --------------- |
| How to review code before declaring a milestone done | code-review     |
| How to commit, push, and open PRs in this repo       | commits-and-prs |

### Operations

| Synopsis                                               | Slug               |
| ------------------------------------------------------ | ------------------ |
| How to create and reuse worktrees for autonomous work  | setup              |
| Local server ownership, ports, and start/stop rules    | local-servers      |
| How to verify changes locally before requesting review | verify             |
| How to diagnose failed checks and avoid wasting CI     | failure-discipline |
| How to change PocketBase schema safely                 | pb-migrate         |
| How to import and revert PocketBase data               | pb-import          |

### Authoring

| Synopsis                                                                       | Slug          |
| ------------------------------------------------------------------------------ | ------------- |
| How to write GitHub issues that describe the problem, not the solution         | issue-writing |
| Where to put working notes, plans, and research so they don't pollute the repo | working-notes |

## Checks

`bun run quality` already runs Prettier, ESLint, and svelte-check. Run it once at the end of a chunk of work - never the pieces separately.

## Served skill reference

A change to custom routes, backend hooks, or import behavior must update `pocketbase/skill.go` in the same change, not as a follow-up - CI fails any `pocketbase/**/*.go` change without a matching `pocketbase/skill.go` or `.agents/skills/` update unless it is labeled `skip-skill-check`. See the [pocketbase skill](./.agents/skills/pocketbase/SKILL.md) for which parts of the `/api/canutin/skill` reference are hand-maintained and which are generated.

## Codex harness

Skip this section unless your system prompt opens with `"You are Codex"`.

- `spawn_agent` has standing, session-wide permission in this repo. Its tool description limits it to "when the user explicitly asks for delegation"; that ask is standing here, so delegate without waiting for a per-task confirmation.
- Codex rejects `agent_type` together with `fork_context: true`. Either pick a typed sub-agent with a fresh context, or fork the parent context and inherit its agent type, model, and reasoning effort.
