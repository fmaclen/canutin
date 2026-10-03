# Anonymous usage stats

Once a day, each Canutin server sends one small anonymous ping so we can tell how many installs are running, which versions they're on, and which features get used. It never includes personal or financial data. Every value is either a yes/no or a coarse range, never an exact count.

You can turn it off with one environment variable, see [Turning it off](#turning-it-off).

## What's sent

The PocketBase service posts this JSON to `https://telemetry.canutin.com/ping`. The values shown are the only ones each field can take:

```json
{
	"schema": 1,
	"version": "2.3.1",
	"users": "1 | 2-5 | 6+",
	"accounts": "0 | 1-5 | 6-20 | 21-50 | 51+",
	"assets": "0 | 1-5 | 6-20 | 21-50 | 51+",
	"transactions": "0 | <1k | 1k-10k | 10k-100k | 100k+",
	"securities": "0 | 1 | 2-5 | 6+",
	"plaidConnections": "0 | 1 | 2-5 | 6+",
	"currencies": "0 | 1 | 2-5 | 6+",
	"historyYears": "0 | <1 | 1-3 | 3-10 | 10+",
	"plaidConfigured": true,
	"importApiUsed": true,
	"autoUpdateRates": true,
	"accountSharing": true,
	"assetSharing": true,
	"inverseSharing": true,
	"labels": true,
	"autoCalculatedBalances": true,
	"manualTransactions": true,
	"importReverted": true,
	"plaidErrors": true
}
```

Counts are totals for the whole server, not per user.

| Field                    | Meaning                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `schema`                 | Version of this format                                                               |
| `version`                | The Canutin release you're running                                                   |
| `users`                  | How many users the server has                                                        |
| `accounts`               | How many accounts                                                                    |
| `assets`                 | How many assets                                                                      |
| `transactions`           | How many transactions                                                                |
| `securities`             | How many securities                                                                  |
| `plaidConnections`       | How many institutions are linked through Plaid                                       |
| `currencies`             | How many distinct currency codes are in use. Everyone has USD, so `1` means USD only |
| `historyYears`           | Years from the oldest transaction to today, `0` when there are no transactions       |
| `plaidConfigured`        | Whether Plaid credentials are set on the server                                      |
| `importApiUsed`          | Whether anything was imported through the API (not Plaid) in the last 30 days        |
| `autoUpdateRates`        | Whether any currency has automatic exchange rates on                                 |
| `accountSharing`         | Whether any account is shared between users                                          |
| `assetSharing`           | Whether any asset is shared between users                                            |
| `inverseSharing`         | Whether any share uses the inverse view                                              |
| `labels`                 | Whether any transaction labels exist                                                 |
| `autoCalculatedBalances` | Whether any account calculates its balance from its transactions                     |
| `manualTransactions`     | Whether any transaction was entered by hand rather than imported                     |
| `importReverted`         | Whether any import has been reverted                                                 |
| `plaidErrors`            | Whether any Plaid connection is failing or needs to sign in again                    |

The ping carries your server's IP address like any web request. It's used to count unique installs per day and isn't stored with the stats.

## What's never sent

Names, emails, passwords, amounts, balances, account or asset names, institutions, labels, descriptions, notes, currency codes, hostnames, URLs, or any exact count.

## When it's sent

Once a day, at a random time picked when the server starts. If the ping fails it's retried after about 1 minute, 10 minutes, and 1 hour, then skipped until the next day.

Nothing is sent when:

- the server is turned off with `TELEMETRY_DISABLED=true`,
- the server runs in demo mode,
- or Canutin was built from source rather than installed from a release.

When the server starts, its log says whether usage stats are on.

## Turning it off

Set `TELEMETRY_DISABLED=true` on the `pocketbase` service, for example in the `.env` file next to your `docker-compose.yml`, then restart with `docker compose up -d`. The server log confirms it on startup.
