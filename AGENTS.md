# Canutin

Canutin is a personal finance application: SvelteKit on the frontend, PocketBase for the backend and database, and Bun for local tooling.

> This file is `AGENTS.md`. `CLAUDE.md` is a symlink to it - edit `AGENTS.md`.

## Your role

Before you call any other tool, read any other file, or respond to the user, open your role skill. The skill body is not auto-injected - opening it is your first action.

1. If your prompt explicitly assigns you the **Executor** role, read [.agents/skills/executor/SKILL.md](./.agents/skills/executor/SKILL.md).
2. Otherwise you are the **Orchestrator**. Read [.agents/skills/orchestrator/SKILL.md](./.agents/skills/orchestrator/SKILL.md).
3. If your system prompt opens with `"You are Codex"`, also read [.agents/skills/codex/SKILL.md](./.agents/skills/codex/SKILL.md).
4. If your system prompt opens with `"You are OpenCode"`, also read [.agents/skills/opencode/SKILL.md](./.agents/skills/opencode/SKILL.md).

A common failure is treating a task-specific request like "review this PR" or "write a test" as license to load only the matching skill and skip the role. Load the role first, every session, before any task-specific skill.

## Skills

Each skill lives at `.agents/skills/<slug>/SKILL.md`.

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
| How to verify changes locally before requesting review | verify             |
| How to diagnose failed checks and avoid wasting CI     | failure-discipline |
| How to change PocketBase schema safely                 | pb-migrate         |
| How to import and revert PocketBase data               | pb-import          |

### Authoring

| Synopsis                                                                       | Slug          |
| ------------------------------------------------------------------------------ | ------------- |
| How to write GitHub issues that describe the problem, not the solution         | issue-writing |
| Where to put working notes, plans, and research so they don't pollute the repo | working-notes |

### Harness

Load when your tool list matches the harness. The agent must check tool availability and load proactively - this is not auto-injected.

| Synopsis                                                                                 | Slug     |
| ---------------------------------------------------------------------------------------- | -------- |
| Harness-specific quirks for Codex sessions - spawn_agent rules and validation gotchas    | codex    |
| Harness-specific quirks for opencode sessions - plan mode rules and delegation reminders | opencode |
