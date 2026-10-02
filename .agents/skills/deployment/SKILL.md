---
name: deployment
description: Docker-based deployment, release workflow, semantic-release
---

# Deployment

Canutin ships as one Docker container running the custom PocketBase binary. It serves the static SvelteKit app, API, realtime updates, and admin UI on port `42070`. The runtime image needs no Node or Bun server.

## Build

`bun run build` writes the static frontend to `build/`. The Dockerfile builds that frontend and the Go binary, then copies them into the runtime image. The optional `APP_VERSION` build argument sets the version displayed in Settings. Release builds pass the freshly published version; local builds default to `package.json`.

## Runtime

The container runs from `/app/pocketbase` and keeps its database at `/app/pocketbase/pb_data`. Preserve that volume across upgrades. The static frontend is in `/app/build`, matching the default `--publicDir ../build`.

A reverse proxy forwards the whole app domain to port `42070`, including `/api/` and `/_/`, and supports long-lived realtime connections. Browser API requests use the same origin. Migration from the old two-service deployment, including volume and upstream-port handling, is documented in the [README](../../../README.md#migrating-an-existing-two-service-deployment).

Public settings are read by PocketBase at runtime and returned from `/api/canutin/config`:

- `PUBLIC_DEMO_ENABLED` enables the demo account and its reset job.
- `PUBLIC_PLAUSIBLE_DOMAIN` and `PUBLIC_PLAUSIBLE_SCRIPT_URL` enable analytics only when both are set.

All are optional. Compose forwards them to the `pocketbase` service. No browser backend URL or frontend origin variable is required.

### Plaid

Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` in the `.env` beside the deployment's Compose file. Set all three to enable Plaid. Use `sandbox` for development and `production` for live data; credentials without an explicit environment are rejected.

Compose's `.env` provides substitution values; the `pocketbase.environment` mappings pass them into the container. Recreate the container after changing runtime settings.

## Releases and updates

The migration from separate frontend and backend services requires a breaking release and coordinated host cutover. Follow the README migration steps before updating existing hosts. Changes to live proxies, Cloudflare Access, and host services are separate deployment work. Keep external host documentation describing what is actually running until cutover; update it as part of that deployment.

Semantic-release uses conventional commits to publish versions and images. See [commits and PRs](../commits-and-prs/SKILL.md#type-prefix-decides-whether-the-change-deploys) for the supported types. Each host decides when to pull updates. The README documents manual updates and an optional maintained Watchtower fork.

New environment variables must be optional with safe defaults, because unattended updates do not change a host's `.env`. A required new variable belongs in a breaking release with migration notes.

Use the admin UI or import API to change production data. Development superuser credentials are only created by the local startup script, never by the production container.
