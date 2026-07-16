---
name: pb-import
description: Import data into Canutin via the PocketBase bulk import API, list import sessions, or revert a previous import. Use when the user asks to import bank data, check import history, or undo/rollback an import.
---

Manage bulk data imports into Canutin through the PocketBase custom API routes. Supports importing currencies, accounts, assets, securities, cash transactions, security holding snapshots, and security trade history with automatic deduplication, as well as listing and reverting import sessions.

## Prerequisites

- PocketBase dev server must be running at `http://127.0.0.1:42070`
- A user account must exist (email + password)

## Authentication

All API calls require a Bearer token from a regular user (not superadmin):

```bash
# Get a token
TOKEN=$(curl -s http://127.0.0.1:42070/api/collections/users/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"user@example.com","password":"password"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
```

Or using the PocketBase JS SDK:

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:42070');
await pb.collection('users').authWithPassword(email, password);
const token = pb.authStore.token;
```

The owner of every imported record is the authenticated token's user.

## Bulk Import

`POST /api/canutin/import`

The body is an import payload: a required `sessionLabel` plus any of seven optional arrays. At least one array must be non-empty.

```json
{
	"sessionLabel": "my-scraper-2025-08-25",
	"currencies": [ ... ],
	"accounts": [ ... ],
	"assets": [ ... ],
	"securities": [ ... ],
	"transactions": [ ... ],
	"securityBalances": [ ... ],
	"securityTransactions": [ ... ]
}
```

- `sessionLabel` is **required**, must be non-empty, and is capped at 256 runes.
- Dates accept either ISO format (`2025-08-25T00:00:00.000Z`) or PocketBase format (`2025-08-25 00:00:00.000Z`). Only the date part is used unless noted.
- **Unknown or extra JSON fields are silently dropped** by the decoder — no error is raised. Only the fields listed below are read.

### How the data model works (read before building a payload)

Canutin computes an investment account's total value as **cash + positions**, summed in the UI, never in a single stored column:

- **Cash** comes from the account's latest `accountBalances` snapshot (an `accounts[].balance`, or a derived recompute — see `autoCalculated` below).
- **Positions** come **exclusively** from `securityBalances` holding snapshots.

Consequences you must design for:

- **`securityTransactions` are display-only trade history.** They never affect holdings or balances. Buying a security does not change the account's value — you must also post a `securityBalances` snapshot to reflect the new holding.
- **Do not write portfolio/holding value into an account's cash balance.** Putting security value into `accounts[].balance.value` (or a manual `accountBalances` row) double-counts it on top of the `securityBalances`-derived positions value. Cash snapshots should carry only cash.

### Nullable numbers on securities (carry-forward)

`securityBalances` and `securityTransactions` number fields (`quantity`, `price`, `value`, `costBasis`, `amount`, `fees`) are **nullable**. `null` (or omitted) means unknown; `0` means a known zero. For `securityBalances` holding snapshots, carry-forward depends on the field:

- **Market value (`value`)** carries forward from the most recent prior snapshot with a known value. **`price` does not carry forward.**
- **`costBasis`** carries forward only while the current and prior quantities are both known and unchanged. After any quantity-changing event, importers must explicitly provide the resulting `costBasis` when it is known, including after a split; otherwise leave it `null`.
- **`quantity: 0` closes a position.** Value and cost basis resolve to 0 and carry-forward **stops** at that lot boundary (a later re-buy with no fresh value or cost basis stays unknown, rather than reusing the old lot's data).

Rule of thumb: send `value`/`price`/`costBasis` explicitly on every snapshot you actually know; leave them `null` only when genuinely unknown. **Never emit `0` for an unknown value** — it will be read as a real zero. Always send the resulting basis when known after quantity changes, including splits, and post a `quantity: 0` snapshot to close out a holding.

### currencies[]

Declares currencies and their exchange-rate quotes. Each quote is stored as an owner-scoped manual `exchangeRates` row.

| Field           | Type    | Required | Notes                                                                                                                                                |
| --------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`          | string  | yes      | Uppercase, must match `^[A-Z0-9]{2,10}$`                                                                                                             |
| `name`          | string  | no       | ≤256 runes                                                                                                                                           |
| `autoUpdate`    | boolean | no       | Default false. On import it is stored but not fetch-validated — a bogus code won't fail the import; the daily 5am rate cron attempts the fetch later |
| `quotes`        | array   | **yes**  | At least one quote required per declared currency                                                                                                    |
| `quotes[].date` | string  | yes      | ISO or PB date; the date part must parse                                                                                                             |
| `quotes[].rate` | number  | yes      | Must be finite and **> 0**                                                                                                                           |

**Quote direction:** a rate is **units of the foreign currency per 1 USD** (USD is the pivot and is never stored as a fetched rate — but the import loop doesn't skip it, so declaring USD in `currencies[]` with quotes writes inert owner-scoped manual `exchangeRates` rows). Manual import quotes are stored verbatim, so they must follow this direction to convert correctly. Manual quotes override same-day fetched rates.

Quotes dedup on `owner + currency + day`.

### accounts[]

| Field            | Type    | Required | Notes                                                                              |
| ---------------- | ------- | -------- | ---------------------------------------------------------------------------------- |
| `name`           | string  | yes      | ≤256                                                                               |
| `institution`    | string  | no       | Part of the dedup key when present                                                 |
| `balanceGroup`   | string  | no       | `CASH\|DEBT\|INVESTMENT\|OTHER` — stored raw, not validated. Part of the dedup key |
| `balanceType`    | string  | no       | Free-form; find-or-created in `balanceTypes` by name. NOT part of the dedup key    |
| `currency`       | string  | no       | `^[A-Z0-9]{2,10}$`; defaults to `USD`. Immutable once set                          |
| `autoCalculated` | boolean | no       | Stored as a timestamp — see warning below                                          |
| `closed`         | boolean | no       | Stored as a timestamp                                                              |
| `excluded`       | boolean | no       | Stored as a timestamp                                                              |
| `balance`        | object  | no       | `{ "value": number, "asOf": string }` — a single `accountBalances` cash snapshot   |

There is no `notes` field on account import (the schema has one; the importer omits it).

**`autoCalculated` clobbers imported snapshots.** When set, the backend recomputes the account's latest cash balance by summing its non-excluded cash transactions into a new `accountBalances` row stamped `source="derived"` with `asOf = now()`. Because that derived row is stamped now, it becomes the latest cash balance and overrides any imported `balance` snapshot. It runs synchronously at import for any account that got ≥1 transaction this import, and re-fires later on any transaction create/update/delete on that account. So importing an `autoCalculated` account with a balance snapshot but only a partial slice of its cash transactions produces a derived recompute over that incomplete history that overrides the snapshot. (A snapshot-only account — no transactions this import — keeps its imported snapshot until a later transaction edit triggers a recompute.) To preserve an imported cash snapshot, leave `autoCalculated` false — or import the full transaction history that reconstructs it.

Accounts dedup on `name + balanceGroup + owner`, plus `institution` when present. Account cash snapshots (`accountBalances`) dedup on `account + day(asOf) + value + owner`.

### assets[]

Assets are the legacy "whole asset" concept (a house, a collectible), distinct from securities.

| Field          | Type    | Required | Notes                                                            |
| -------------- | ------- | -------- | ---------------------------------------------------------------- |
| `name`         | string  | yes      | ≤256                                                             |
| `balanceGroup` | string  | no       | Stored raw                                                       |
| `balanceType`  | string  | no       | Find-or-created by name                                          |
| `currency`     | string  | no       | Defaults to `USD`. Immutable once set                            |
| `sold`         | boolean | no       | Stored as a timestamp                                            |
| `excluded`     | boolean | no       | Stored as a timestamp                                            |
| `balance`      | object  | no       | `{ "marketValue": number, "bookValue": number, "asOf": string }` |

**Assets have no `symbol`, `type`, `quantity`, `marketPrice`, or `bookPrice` fields** — any such fields are silently dropped. Only `marketValue`, `bookValue`, and `asOf` exist on an asset balance.

Assets dedup on `name + owner` only (not symbol). Asset balances dedup on `asset + day(asOf) + marketValue + owner`.

### securities[]

Declares a security so you can set its currency. Securities are also auto-created on demand when a `securityBalances` or `securityTransactions` row references one by name/symbol — but those auto-created securities are always `USD`. List a security here to give it a non-USD currency.

| Field      | Type   | Required | Notes                                                                             |
| ---------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `name`     | string | yes      | ≤256; trimmed, internal whitespace collapsed, unique per owner case-insensitively |
| `symbol`   | string | no       | ≤32; upper-cased and trimmed                                                      |
| `currency` | string | no       | Defaults to `USD`. Immutable once set                                             |

Securities dedup on `(symbol OR normalized name) + owner`.

### transactions[] (cash transactions)

| Field          | Type     | Required | Notes                                                                |
| -------------- | -------- | -------- | -------------------------------------------------------------------- |
| `accountId`    | string   | no       | Preferred reference; accepted only if owned                          |
| `accountName`  | string   | yes      | ≤256                                                                 |
| `institution`  | string   | no       | Used for tuple account resolution                                    |
| `balanceGroup` | string   | no       | Used for tuple account resolution                                    |
| `date`         | string   | yes      | ISO or PB date                                                       |
| `description`  | string   | no       | ≤2000; normalized (trim / collapse whitespace / lowercase) for dedup |
| `value`        | number   | no       | Finite; defaults to 0 if omitted                                     |
| `externalId`   | string   | no       | **Honored only here**; primary dedup key when present                |
| `labels`       | string[] | no       | Each ≤256; find-or-created in `transactionLabels`                    |
| `excluded`     | boolean  | no       | Stored as a timestamp                                                |

`externalId` is the only place it is honored — it does not exist on securities, security balances, security transactions, accounts, or assets, and is dropped if supplied there.

Transactions with an `externalId` dedup on `account + externalId + owner`. Without one, they dedup on `account + day(date) + value + owner`, then match on normalized description.

### securityBalances[] (holding snapshots)

The **only** source of holdings and positions value. Number fields are nullable — see the carry-forward section above.

| Field                                            | Type         | Required     | Notes                                                                                                                                     |
| ------------------------------------------------ | ------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `accountId` OR `accountName`                     | string       | one required | Resolved by accountId or unique bare name only (no institution/group tuple here)                                                          |
| `securityId` / `securityName` / `securitySymbol` | string       | unenforced   | Not server-validated. Resolves an existing security or auto-creates one (USD); omitting all three creates a junk empty-named USD security |
| `asOf`                                           | string       | yes          | Normalized to `<day> 00:00:00.000Z`                                                                                                       |
| `quantity`                                       | number\|null | no           | Nullable; `0` closes the position                                                                                                         |
| `price`                                          | number\|null | no           | Nullable                                                                                                                                  |
| `value`                                          | number\|null | no           | Nullable — the position's total value                                                                                                     |
| `costBasis`                                      | number\|null | no           | Nullable                                                                                                                                  |

Dedup on `account + security + exact-day(asOf) + owner`, then all non-null numbers must match.

### securityTransactions[] (trade history)

Display-only history. **Never affects holdings or balances** — post a `securityBalances` snapshot to change the actual holding.

| Field                                            | Type         | Required     | Notes                                                                                                                       |
| ------------------------------------------------ | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `accountId` OR `accountName`                     | string       | one required | accountId or unique bare name only                                                                                          |
| `securityId` / `securityName` / `securitySymbol` | string       | unenforced   | Not server-validated. Resolves or auto-creates a security (USD); omitting all three creates a junk empty-named USD security |
| `date`                                           | string       | yes          | Normalized to the day                                                                                                       |
| `type`                                           | string       | no           | Schema select `buy\|sell\|cancel\|cash\|fee\|transfer` (not enforced by the importer)                                       |
| `subtype`                                        | string       | no           |                                                                                                                             |
| `name`                                           | string       | no           | ≤256; used as the dedup label when present                                                                                  |
| `description`                                    | string       | no           | ≤2000; dedup label fallback                                                                                                 |
| `quantity` / `price` / `amount` / `fees`         | number\|null | no           | Nullable                                                                                                                    |
| `notes`                                          | string       | no           | ≤5000. `notes` is accepted only here, not on cash transactions or accounts                                                  |

There is **no `externalId`** on securityTransactions — any supplied is dropped. Dedup on `account + security + day(date) + type + owner`, then the label (normalized `name`, else `description`) and all non-null numbers must match.

### Account reference resolution

Cash transactions can reference an account three ways, tried in order:

1. `accountId` — accepted **only if owned**; a foreign or missing id is a row error.
2. `name + institution + balanceGroup` tuple — only when institution or balanceGroup is provided.
3. Bare `accountName` — succeeds **only if exactly one** owned account matches; ambiguous matches are a row error.

`securityBalances` and `securityTransactions` resolve accounts with empty institution/group, so they can use only `accountId` or a **unique** bare `accountName`.

### Currency rules

- Any `currency` referenced on accounts/assets/securities must already exist in the user's currency registry OR be declared in this payload's `currencies[]` with ≥1 quote. Otherwise the whole request fails with `400 Missing currencies`.
- Every user is seeded a `USD` currency, so USD always resolves. Account/asset/security currency defaults to `USD` and is immutable once set.
- Securities auto-created from balances/transactions are always `USD` — declare them in `securities[]` to choose a currency.

### Partial success

`handleImport` does **not** run inside a database transaction. Rows are saved independently: a failed row is logged, increments `recordsFailed`, and the loop continues. Whatever succeeded persists. Duplicate rows count as `existing`/`skipped`, not failures. Only **revert** is atomic.

Whole-request rejections (nothing is written):

- Body > 64 MiB → `413`
- Invalid JSON → `400`
- Structural validation errors → `400` with `{ error, errors: [{ field, message }] }`
- Missing currency references → `400` with `{ error: "Missing currencies", missingCurrencies: [...] }`

### Payload limits

- Body ≤ **64 MiB**.
- Total records across all collections ≤ **200,000** (exchange-rate count = the sum of all `quotes`).
- Any single collection ≤ **100,000**.
- String caps (runes): `sessionLabel` / `name` / label 256, symbol 32, description 2,000, notes 5,000.

### Response

HTTP 200. Every collection reports the same `{ created, existing, skipped }` triple (accounts/assets/securities/currencies/exchangeRates use created + existing; transactions/balances use created + skipped).

```json
{
	"sessionId": "abc123def456ghi",
	"status": "completed",
	"recordsFailed": 0,
	"currencies": { "created": 0, "existing": 1, "skipped": 0 },
	"exchangeRates": { "created": 1, "existing": 0, "skipped": 0 },
	"accounts": { "created": 1, "existing": 0, "skipped": 0 },
	"assets": { "created": 1, "existing": 0, "skipped": 0 },
	"securities": { "created": 1, "existing": 0, "skipped": 0 },
	"transactions": { "created": 5, "existing": 0, "skipped": 2 },
	"accountBalances": { "created": 1, "existing": 0, "skipped": 0 },
	"assetBalances": { "created": 1, "existing": 0, "skipped": 0 },
	"securityBalances": { "created": 1, "existing": 0, "skipped": 0 },
	"securityTransactions": { "created": 1, "existing": 0, "skipped": 0 }
}
```

The response `status` is one of `completed` | `completed_with_errors` | `failed` (`rolled_back` is set later by revert). `pending` is a transient session status only and is never returned by the import endpoint:

- `completed` — no row errors.
- `completed_with_errors` — some rows failed but at least one record was created.
- `failed` — rows failed and nothing was created.
- `rolled_back` — set by revert.

### Example with curl

```bash
curl -s http://127.0.0.1:42070/api/canutin/import \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionLabel":"test","accounts":[...],"transactions":[...]}'
```

### Example with PocketBase JS SDK

```typescript
const result = await pb.send('/api/canutin/import', {
  method: 'POST',
  body: { sessionLabel: 'test', accounts: [...], transactions: [...] }
});
```

## List Import Sessions

Use the standard PocketBase collection API:

```bash
curl -s "http://127.0.0.1:42070/api/collections/importSessions/records?sort=-created" \
  -H "Authorization: Bearer $TOKEN"
```

Session fields: `id`, `label`, `owner`, `recordsCreated`, `recordsSkipped`, `recordsFailed`, `status` (`pending` | `completed` | `completed_with_errors` | `failed` | `rolled_back`), `created`, `updated`.

## Revert an Import

`POST /api/canutin/import/revert`

Atomically deletes all financial records created by an import session — cash transactions, security transactions, account balances, asset balances, security balances, accounts, assets, and securities — and cleans up orphaned labels and balance types. It also recomputes derived balances for any pre-existing `autoCalculated` accounts that the reverted transactions touched. The operation runs inside a database transaction: either everything is reverted or nothing is.

Revert does **not** delete import-created `currencies` rows or their manual `exchangeRates` quotes — those rows carry no `importSession` tag.

### Payload

```json
{ "sessionId": "abc123def456ghi" }
```

### Response

```json
{ "sessionId": "abc123def456ghi", "deleted": 15 }
```

### Example

```bash
curl -s http://127.0.0.1:42070/api/canutin/import/revert \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"abc123def456ghi"}'
```

## Important

- The `sessionId` must be a valid 15-character PocketBase record ID (`^[a-z0-9]{15}$`)
- Running the same import payload twice is safe — duplicates are skipped
- Reverted sessions are marked as `rolled_back` and cannot be reverted again
- The import session is visible in the Canutin UI at `/settings`
