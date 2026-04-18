---
name: auth-system
description: PocketBase-based auth - users collection, context store, protected route guard
---

# Authentication System

## Overview

Canutin uses PocketBase's built-in `users` auth collection. The frontend auth state lives in `src/lib/auth.svelte.ts`. There is no external IdP.

## Key Files

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `src/lib/auth.svelte.ts`          | Auth context store (login, logout, state) |
| `src/lib/pocketbase.svelte.ts`    | PocketBase client wrapper                  |
| `src/routes/(guest)/auth/`        | Login and signup pages                     |
| `src/routes/(app)/+layout.svelte` | Protected route guard                      |
| `src/routes/(guest)/+layout.ts`   | Guest route layout                         |

## Collections

- `users` — PocketBase auth collection. Email + password with `emailVisibility` controlled per record.
- `_superusers` — PocketBase built-in superadmin collection (dev only).

Types are generated in `src/lib/pocketbase.schema.ts`.

## Route Protection

- `src/routes/(app)/` — requires an authenticated user. `(app)/+layout.svelte` redirects to the auth page when `authStore` is unauthenticated.
- `src/routes/(guest)/` — public routes (auth forms, landing).

## Login Flow

1. User submits email + password on the auth form.
2. `authStore.login(email, password)` calls `pb.collection('users').authWithPassword(...)`.
3. PocketBase SDK persists the token in `localStorage` via its default auth store.
4. Context store updates; `(app)/+layout.svelte` stops redirecting.

## Signup Flow

1. User submits email + password + confirmation.
2. `pb.collection('users').create(...)` then `authWithPassword` to immediately log in.

## Dev Credentials

- Superadmin (auto-upserted by `scripts/pb-server.ts`): `superadmin@example.com` / `123qweasdzxc`
- Test users created via `seedUser(name)` in `e2e/pocketbase.helpers.ts` use `DEFAULT_PASSWORD` (`123qweasdzxc`) and a generated email like `alice.<8-char-id>@example.com`.

## Testing

- E2E tests use `seedUser` + the `login` helper in `e2e/playwright.helpers.ts`.
- Never hardcode passwords in tests — always reference `DEFAULT_PASSWORD`.

## Anti-patterns

- **Rolling a custom session store** — trust the PocketBase SDK's auth store
- **Storing tokens outside the SDK** — it handles persistence and refresh
- **Protecting a route via manual checks** — use the `(app)` group layout
- **Using `superadmin@example.com` in production** — dev only, never ship

## See Also

- [pocketbase.md](../pocketbase/SKILL.md) - Backend context
- [testing.md](../testing/SKILL.md) - Seeding users for E2E tests
- [realtime.md](../realtime/SKILL.md) - Auth-aware subscriptions in stores
