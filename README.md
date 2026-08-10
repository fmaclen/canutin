# Canutin v2 (Next)

This is the next prerelease branch for Canutin v2.

## Self-hosting (Docker)

Create a `docker-compose.yml` file:

```yaml
services:
  pocketbase:
    image: ghcr.io/fmaclen/canutin:next
    working_dir: /app/pocketbase
    command: ['./pocketbase-custom', 'serve', '--http', '0.0.0.0:42070']
    ports:
      - '42070:42070'
    environment:
      PLAID_CLIENT_ID: ${PLAID_CLIENT_ID:-}
      PLAID_SECRET: ${PLAID_SECRET:-}
      PLAID_ENV: ${PLAID_ENV:-sandbox}
    volumes:
      - canutin-data:/app/pocketbase/pb_data
    restart: unless-stopped

  sveltekit:
    image: ghcr.io/fmaclen/canutin:next
    command: ['node', 'build/index.js']
    ports:
      - '42069:42069'
    environment:
      PUBLIC_PB_URL: 'http://localhost:42070'
    depends_on:
      - pocketbase
    restart: unless-stopped

volumes:
  canutin-data:
```

To enable Plaid, create a `.env` file beside `docker-compose.yml` with production credentials:

```dotenv
PLAID_CLIENT_ID=<client-id>
PLAID_SECRET=<secret>
PLAID_ENV=production
```

Then run:

```bash
docker compose up -d
```

Open [http://localhost:42069](http://localhost:42069) to access Canutin.

### Initial setup

On first run, PocketBase needs a superuser to be configured. Get the setup link from the logs:

```bash
docker compose logs pocketbase | grep "pbinstal"
```

Open the URL in your browser to create your superuser account. Once complete, refresh Canutin to start using the app.

## Development

All you need to start is [Bun](https://bun.sh) installed, then run:

```bash
bun install && bunx playwright install && bun run test
```

## Commands

| Command                                                                                                                                                                                | Description                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun run dev`                                                                                                                                                                          | Start Vite dev server                                       |
| `bun run build`                                                                                                                                                                        | Production build via Vite/SvelteKit                         |
| `bun run preview`                                                                                                                                                                      | Preview the built app                                       |
| `bun run check`                                                                                                                                                                        | Type-check with svelte-check                                |
| `bun run check:watch`                                                                                                                                                                  | Type-check in watch mode                                    |
| `bun run lint`                                                                                                                                                                         | Prettier check + ESLint                                     |
| `bun run verify`                                                                                                                                                                       | Non-mutating gate: lint, type-check, and build              |
| `bun run format`                                                                                                                                                                       | Auto-format with Prettier (writes files)                    |
| `bun run quality`                                                                                                                                                                      | Format, lint, and type-check (writes files via format)      |
| `bun run test`                                                                                                                                                                         | Run Playwright e2e tests                                    |
| `bun run pb`                                                                                                                                                                           | Ensure and start PocketBase locally (dev)                   |
| `bun run pb:import temp/Canutin.demo.vault --email user@example.com --password secret --pb-url http://127.0.0.1:42070 --superuser-email admin@example.com --superuser-password secret` | Import Canutin v1 vault into PocketBase for a specific user |
| `bun run pb:reset`                                                                                                                                                                     | Reset (delete) the PocketBase dev database                  |

If the target user already exists, `--password` is optional and the import will reuse that user.
The import command requires explicit `--pb-url`, `--superuser-email`, and `--superuser-password` options.
