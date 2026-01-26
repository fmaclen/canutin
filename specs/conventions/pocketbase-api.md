# PocketBase API Conventions

## Overview

Direct API access for debugging tests, inspecting data, and querying logs during development.

## Dev Environment

- Base URL: `http://127.0.0.1:42070`
- Server is always running in background (don't start it)
- Types auto-generated in `src/lib/pocketbase.schema.ts` on schema changes

## Authentication

- Superuser: `superadmin@example.com` / `123qweasdzxc`
- Auth endpoint: `POST /api/collections/_superusers/auth-with-password`
- Include token in `Authorization` header for subsequent requests
- Test helpers in `e2e/pocketbase.helpers.ts` already handle auth (see [testing.md](./testing.md))

## Available APIs

All PocketBase APIs are available to authenticated superusers:

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

## Collections

- All collections in schema are queryable by superadmins
- Reference `src/lib/pocketbase.schema.ts` for types and field names
- Filter syntax: `field='value'`, `&&`, `||`, `>=`, etc.

## Schema Changes

- Never write migrations by hand
- Migrations auto-generated via PocketBase Admin UI
- Ask the user to make schema changes manually when needed

## Go Hooks

Reference: `pocketbase/main.go`

Current hooks:

- **Balance calculation** - After transaction create/update/delete, enqueues affected account(s) for balance recalculation with 250ms trailing-edge debounce

Pattern for new hooks:

- Use `OnRecordAfter*Success` hooks for post-mutation logic
- Debounce expensive operations using worker pattern with ticker
- Handle account reassignment in update hooks (old and new account)
- Split into multiple files when `main.go` becomes unwieldy

## Anti-patterns

- **Dev credentials in production** - These are for local development only
- **Hand-written migrations** - Use the Admin UI to generate migrations
- **Starting the PB server** - It's already running; don't start it

## See Also

- [realtime.md](./realtime.md) - Client-side subscription patterns
- [testing.md](./testing.md) - Test helpers for seeding/querying data
- PocketBase docs: https://pocketbase.io/docs/
