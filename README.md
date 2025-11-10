# Canutin v2 (Next)

This is the next prerelease branch for Canutin v2.

## Install (Docker)

Docker images are automatically built and published for each release on the `next` branch at `ghcr.io/fmaclen/canutin:next`.

To deploy Canutin using Docker, execute this command and then access the application at `http://localhost:42069`:

```bash
docker run -d \
  --name canutin \
  -p 42069:42069 \
  -p 42070:42070 \
  -v canutin-data:/app/pocketbase/pb_data \
  --restart=unless-stopped \
  ghcr.io/fmaclen/canutin:latest
```

Alternatively, create a `docker-compose.yml` file:

```yaml
services:
  canutin:
    image: ghcr.io/fmaclen/canutin:latest
    container_name: canutin
    ports:
      - "42069:42069"
      - "42070:42070"
    volumes:
      - canutin-data:/app/pocketbase/pb_data
    restart: unless-stopped
    environment:
      HOST: "0.0.0.0"
      PORT: "42069"
      PUBLIC_PB_URL: "http://localhost:42070"

volumes:
  canutin-data:
```

Then run: `docker compose up -d`

## Development

All you need to start is:

```bash
bun install
bun run test
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
