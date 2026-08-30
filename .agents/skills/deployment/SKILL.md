---
name: deployment
description: Docker-based deployment, release workflow, semantic-release
---

# Deployment

## Overview

Canutin ships as a Docker image that bundles the SvelteKit Node server and the custom PocketBase binary. Releases are cut by semantic-release based on conventional commits.

## Files

| File                 | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `Dockerfile`         | Multi-stage build: Go (PB) + Node (SK); takes the `APP_VERSION` build arg |
| `docker-compose.yml` | Local / dev compose file                                                  |
| `.releaserc.json`    | semantic-release config                                                   |
| `.github/workflows/` | CI workflows (tests, release, image)                                      |

## Build

```bash
bun run build
```

Produces the SvelteKit build output for the Node adapter. The Docker build additionally compiles the PocketBase Go binary from `pocketbase/`.

## Release

Handled by semantic-release via the release workflow. Conventional commits drive the version bump:

- `feat:` → minor
- `fix:` → patch
- `feat!:` / `BREAKING CHANGE:` → major

See [code-quality.md](../code-quality/SKILL.md#commit-messages) for the full type list.

## Updates

Every release publishes a new image, but nothing in this repo updates a running deployment. Each host decides when to pull, and how it does that is host configuration, not repo configuration. The README documents the manual `docker compose pull` and an optional Watchtower service for anyone who wants updates applied automatically.

New environment variables must stay optional with a safe default, because a host that pulls unattended gets the new image without anyone touching its `.env`. A variable that cannot degrade gracefully belongs in a breaking-change release, where the notes call it out.

## Runtime

At runtime the container:

1. Starts the PocketBase binary (with the project's compiled Go hooks) on `:42070`
2. Starts the SvelteKit Node adapter on `:3000` (or whatever the compose file maps)
3. Uses `PUBLIC_PB_URL` to point the frontend at the in-container PocketBase

## Environment Variables

Minimum required at runtime:

- `PUBLIC_PB_URL` — URL the frontend uses to reach PocketBase (may be the same host as the SvelteKit server or a dedicated subdomain)

Optional Plausible analytics variables for the SvelteKit container:

- `PUBLIC_PLAUSIBLE_DOMAIN` — site domain registered in Plausible
- `PUBLIC_PLAUSIBLE_SCRIPT_URL` — full URL of the Plausible tracker script

Analytics loads only when both the domain and script URL are set.

At build time the image takes one optional build arg:

- `APP_VERSION` — the version the app displays in Settings. Defaults to `package.json`'s `version`; the release workflow passes the freshly published version because the Docker build checks out the commit before semantic-release bumps it.

Additional variables depend on your deployment target and any custom Go hooks you've added. Check `.env.example` if one exists; otherwise inspect the compose files.

### Plaid

The PocketBase container reads the Plaid credentials. Set these in the `.env` file beside the deployment's `docker-compose.yml`:

```dotenv
PLAID_CLIENT_ID=<client-id>
PLAID_SECRET=<secret>
PLAID_ENV=production
```

Set all three values to enable Plaid. Use `sandbox` for development and `production` for live data; credentials without an explicit environment are rejected.

Compose's `.env` file supplies substitution values; the `pocketbase.environment` mappings in the compose file pass them into the container. After changing them, recreate PocketBase with `docker compose up -d --force-recreate pocketbase`.

## Anti-patterns

- **Hand-editing production pb_data** — use the PocketBase admin UI or import API
- **Skipping conventional commits** — breaks semantic-release version inference
- **Shipping dev superadmin credentials** — override `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` in production

## See Also

- [pocketbase.md](../pocketbase/SKILL.md) - Backend runtime
- [code-quality.md](../code-quality/SKILL.md) - Conventional commits
