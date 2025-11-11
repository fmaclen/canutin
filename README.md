# Canutin v2 (Next)

This is the next prerelease branch for Canutin v2.

## Install (Docker)

Clone the repository and use Docker Compose:

```bash
git clone https://github.com/fmaclen/canutin.git
cd canutin
docker compose up -d
```

This will build the Docker image locally and start Canutin at `http://localhost:42069`.

## Development

All you need to start is [Bun](https://bun.sh) installed, then run:

```bash
bun install && bunx playwright install && bun run test
```

## Commands

| Command                                     | Description                                    |
| ------------------------------------------- | ---------------------------------------------- |
| `bun run dev`                               | Start Vite dev server                          |
| `bun run build`                             | Production build via Vite/SvelteKit            |
| `bun run preview`                           | Preview the built app                          |
| `bun run check`                             | Type-check with svelte-check                   |
| `bun run check:watch`                       | Type-check in watch mode                       |
| `bun run lint`                              | Prettier check + ESLint                        |
| `bun run format`                            | Auto-format with Prettier                      |
| `bun run quality`                           | Format, lint, and type-check                   |
| `bun run test`                              | Run Playwright e2e tests                       |
| `bun run pb`                                | Ensure and start PocketBase locally (dev)      |
| `bun run pb:import temp/Canutin.demo.vault` | Import Canutin v1 vault into PocketBase dev DB |
| `bun run pb:reset`                          | Reset (delete) the PocketBase dev database     |
