# Migrating from Canutin v1

Canutin v1 stored everything in a `.vault` file, which is a SQLite database. A script in this repo reads that file and imports it into a running Canutin v2 server: accounts, assets, their balance histories, and every transaction.

The import is tracked. It shows up under **Settings → Imports** in v2, and a **Revert** button there removes everything it created, so you can try it, look around, and redo it.

## Before you start

- A running Canutin v2 server. See the [README](../README.md) for self-hosting instructions.
- A regular user account on that server. Sign up in the v2 app first; the import runs as you.
- Your v1 `.vault` file.
- [Bun](https://bun.sh) installed on any machine that can reach your server. The script talks to the server over HTTP, so it doesn't need to run on the server itself.

## Run the import

Clone this repo and run the script against your vault:

```bash
git clone https://github.com/fmaclen/canutin.git
cd canutin
bun install
bun run pb:import /path/to/Canutin.vault \
  --email you@example.com \
  --password yourpassword \
  --pb-url https://canutin-pb.example.com
```

`--pb-url` is the URL of your server's PocketBase service, the same value as `PUBLIC_PB_URL` in your Docker setup.

Two more options:

- `--currency` sets the currency for everything in the vault, since v1 didn't record one. Defaults to `USD`. A different code must already exist in your v2 currency settings before importing.
- `--label` names the import in **Settings → Imports**. Defaults to the vault's filename.

Running the script again is safe: rows that already exist are skipped, not duplicated.

## What carries over

- Accounts, with their full balance history.
- Assets, with their full balance history.
- All transactions, including excluded ones.
- Transaction categories and groups, flattened into v2 labels. A transaction categorized as "Groceries" in the "Food & drink" group gets both names as labels.
- Auto-calculated accounts behave like they did in v1: their balance is computed from the imported transactions rather than from stored statements.

## What doesn't

- Investment details on assets. v1 assets with a symbol and quantity (stocks, crypto) import as plain assets carrying their total market value. v2 tracks investments as securities held inside accounts, which has no v1 equivalent, so positions have to be re-created by hand if you want them in the portfolio.
- The pending flag on transactions.
- v1 app settings.

If something looks wrong after importing, revert from **Settings → Imports** and run it again.
