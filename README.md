# Canutin (Next)

All you need to start is:

```bash
bun run install
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
