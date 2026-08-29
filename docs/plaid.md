# Syncing banks with Plaid

Canutin can pull balances and transactions from your bank through [Plaid](https://plaid.com). The integration is optional and off by default. You bring your own Plaid API credentials, so your financial data flows directly between your bank, Plaid, and your own Canutin server.

## Get Plaid credentials

1. Create an account at [dashboard.plaid.com](https://dashboard.plaid.com).
2. Copy your **client ID** and **secret** from the dashboard's keys page.
3. Pick an environment. `sandbox` connects to fake banks with test data and works immediately. `production` connects to real banks and requires Plaid's approval, which you request from the dashboard. Plaid's production pricing applies to your own usage.

## Configure Canutin

Set three environment variables on the `pocketbase` service. If you followed the self-hosting setup in the [README](../README.md), create a `.env` file next to your `docker-compose.yml`:

```dotenv
PLAID_CLIENT_ID=<your-client-id>
PLAID_SECRET=<your-secret>
PLAID_ENV=production
```

`PLAID_ENV` must be exactly `sandbox` or `production` and has no default. Restart the containers after changing it:

```bash
docker compose up -d
```

No webhooks or redirect URIs need to be configured on the Plaid side. Bank logins happen inside Plaid's own widget, and Canutin never sees your bank password.

## Link a bank

1. In Canutin, go to **Accounts**, add an account, and choose the option to sign in to your bank.
2. Plaid's window opens. Choose your bank and sign in.
3. Canutin then asks you to match each account at the bank to an existing Canutin account, or create new ones.

## Syncing

Linked accounts sync automatically once a day at 06:00 UTC. To sync sooner, go to **Settings → Linked institutions** and click **Sync** on the institution.

The same page lets you unlink an institution. If a bank requires you to sign in again, the connection shows **Reconnect**, which reopens Plaid's window to refresh access.

## Troubleshooting

- Every Plaid action fails and the server responds with `plaid_not_configured`: one of the three environment variables is missing or `PLAID_ENV` has a value other than `sandbox` or `production`. Fix the `.env` file and restart.
- A connection stops syncing: check **Settings → Linked institutions**. Banks periodically expire access, and the connection will show **Reconnect** when that happens. Connections needing reauthorization are skipped by the nightly sync until you reconnect them.
