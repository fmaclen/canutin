---
name: deployment
description: Docker-based deployment, release workflow, semantic-release
---

# Deployment

## Overview

Canutin ships as a Docker image that bundles the SvelteKit Node server and the custom PocketBase binary. Releases are cut by semantic-release based on conventional commits.

## Files

| File                       | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `Dockerfile`               | Multi-stage build: Go (PB) + Node (SK)   |
| `docker-compose.yml`       | Local / dev compose file                 |
| `docker-compose.prod.yml`  | Production compose file                  |
| `.releaserc.json`          | semantic-release config                  |
| `.github/workflows/`       | CI workflows (tests, release, image)     |

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

## Runtime

At runtime the container:

1. Starts the PocketBase binary (with the project's compiled Go hooks) on `:42070`
2. Starts the SvelteKit Node adapter on `:3000` (or whatever the compose file maps)
3. Uses `PUBLIC_PB_URL` to point the frontend at the in-container PocketBase

## Environment Variables

Minimum required at runtime:

- `PUBLIC_PB_URL` — URL the frontend uses to reach PocketBase (may be the same host as the SvelteKit server or a dedicated subdomain)

Additional variables depend on your deployment target and any custom Go hooks you've added. Check `.env.example` if one exists; otherwise inspect the compose files.

## Anti-patterns

- **Hand-editing production pb_data** — use the PocketBase admin UI or import API
- **Skipping conventional commits** — breaks semantic-release version inference
- **Shipping dev superadmin credentials** — override `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` in production

## See Also

- [pocketbase.md](../pocketbase/SKILL.md) - Backend runtime
- [code-quality.md](../code-quality/SKILL.md) - Conventional commits
