---
name: pocketbase
description: PocketBase backend - schema, Go hooks, admin API, dev credentials, collections
---

# PocketBase Conventions

## Overview

Backend runtime and database for canutin. Custom Go hooks extend PocketBase with balance-calculation logic and custom API routes. A single binary serves HTTP, realtime, and the admin UI.

## Dev Environment

- Base URL: `$PUBLIC_PB_URL` — each checkout has its own port, so read it from the generated `.env` rather than assuming the default
- Server ownership, ports, and start/reset commands: see [local-servers](../local-servers/SKILL.md)
- Types auto-generated in `src/lib/pocketbase.schema.ts` on schema changes

## Authentication

- Superuser (dev only): `superadmin@example.com` / `123qweasdzxc` — auto-upserted on server start via `scripts/pb-server.ts`
- Regular user auth: `POST /api/collections/users/auth-with-password`
- Superuser auth: `POST /api/collections/_superusers/auth-with-password`
- Include token in `Authorization: Bearer <token>` for subsequent requests
- Test helpers in `e2e/pocketbase.helpers.ts` already handle auth — use them instead of reimplementing

## Collections

Source of truth: `src/lib/pocketbase.schema.ts` (generated from live schema).

Core collections: `users`, `accounts`, `transactions`, `assets`, `accountBalances`, `assetBalances`, `balanceTypes`, `transactionLabels`, `accountShares`, `assetShares`.

- All collections are queryable by superadmins
- Regular users are scoped via collection API rules (see the admin UI)
- Filter syntax: `field='value'`, `&&`, `||`, `>=`, etc.

## Available APIs

All PocketBase APIs are available to authenticated clients with the appropriate scope:

| API         | Docs                                        |
| ----------- | ------------------------------------------- |
| Records     | https://pocketbase.io/docs/api-records/     |
| Realtime    | https://pocketbase.io/docs/api-realtime/    |
| Files       | https://pocketbase.io/docs/api-files/       |
| Collections | https://pocketbase.io/docs/api-collections/ |
| Settings    | https://pocketbase.io/docs/api-settings/    |
| Logs        | https://pocketbase.io/docs/api-logs/        |
| Crons       | https://pocketbase.io/docs/api-crons/       |
| Backups     | https://pocketbase.io/docs/api-backups/     |
| Health      | https://pocketbase.io/docs/api-health/      |

## Custom Go Hooks

Location: `pocketbase/main.go` (split into `balance.go`, `shares.go`, `import.go`).

Current hooks:

- **Balance calculation** — after transaction create/update/delete, enqueues affected account(s) for balance recalculation with a 250ms trailing-edge debounce
- **Shares** — ownership/permission extensions on accounts and assets
- **Bulk import** — `/api/canutin/import` and `/api/canutin/import/revert` (see [pb-import.md](../pb-import/SKILL.md))

Pattern for new hooks:

- Use `OnRecordAfter*Success` hooks for post-mutation logic
- Debounce expensive operations using the worker + ticker pattern
- Handle account reassignment in update hooks (old and new account)
- Split into multiple files when `main.go` becomes unwieldy

## Served Skill Reference

`pocketbase/skill.go` hand-maintains the behavioral semantics — custom endpoints, behavioral constraints, auth — of the `/api/canutin/skill` reference; the import payload shape is generated from the Go structs. Update the hand-maintained sections whenever custom routes or backend hooks change. CI enforces this: a change under `pocketbase/**/*.go` without a matching `pocketbase/skill.go` or `.agents/skills/` update fails the PR unless labeled `skip-skill-check`.

## Schema Changes

- **Never** write migration files by hand
- Migrations are auto-generated via the admin API (`POST /api/collections`, `PATCH /api/collections/<id>`) because `Automigrate: true` is set with `TemplateLangJS` — see [pb-migrate.md](../pb-migrate/SKILL.md)
- Migrations land in `pocketbase/pb_migrations/` as JS files

## Anti-patterns

- **Dev credentials in production** — these are for local development only
- **Hand-written migrations** — always go through the admin API
- **Starting PocketBase by default** — follow the ownership rules in [local-servers](../local-servers/SKILL.md)
- **Raw `app.Save()` Go calls for schema** — use the collection API endpoints so automigrate hooks fire
- **Original Ozzo validation module** — use PocketBase's maintained fork (`github.com/pocketbase/ozzo-validation/v4`) so custom validation errors use the same types PocketBase recognizes

## See Also

- [realtime.md](../realtime/SKILL.md) - Client-side subscription patterns
- [testing.md](../testing/SKILL.md) - Test helpers for seeding/querying data
- [pb-import.md](../pb-import/SKILL.md) - Bulk import API
- [pb-migrate.md](../pb-migrate/SKILL.md) - Schema-change workflow
- PocketBase docs: https://pocketbase.io/docs/
