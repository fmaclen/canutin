---
name: pb-import
description: Import data into Canutin via the PocketBase bulk import API, list import sessions, or revert a previous import. Use when the user asks to import bank data, check import history, or undo/rollback an import.
---

Manage bulk data imports into Canutin through the PocketBase custom API routes. Supports importing accounts, assets, transactions, and balances with automatic deduplication, as well as listing and reverting import sessions.

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

## Bulk Import

`POST /api/canutin/import`

Imports accounts, assets, and transactions with automatic deduplication:

- **Accounts**: deduplicated by `name + institution + balanceGroup`
- **Assets**: deduplicated by `name + symbol`
- **Transactions with `externalId`**: deduplicated by `account + externalId`
- **Transactions without `externalId`**: deduplicated by `account + date + value + normalized description`
- **Balances**: deduplicated by `account/asset + asOf + value`

Dates can use either ISO format (`2025-08-25T00:00:00.000Z`) or PocketBase format (`2025-08-25 00:00:00.000Z`).

### Payload

```json
{
	"sessionLabel": "my-scraper-2025-08-25",
	"accounts": [
		{
			"name": "Checking",
			"institution": "Bank of America",
			"balanceGroup": "CASH",
			"balanceType": "Checking",
			"autoCalculated": true,
			"balance": { "value": 5000, "asOf": "2025-08-25 00:00:00.000Z" }
		}
	],
	"assets": [
		{
			"name": "SPDR S&P 500",
			"symbol": "SPY",
			"balanceGroup": "INVESTMENT",
			"balanceType": "ETF",
			"type": "SHARES",
			"balance": {
				"quantity": 10,
				"marketPrice": 550,
				"bookPrice": 450,
				"marketValue": 5500,
				"bookValue": 4500,
				"asOf": "2025-08-25 00:00:00.000Z"
			}
		}
	],
	"transactions": [
		{
			"accountName": "Checking",
			"date": "2025-08-20 00:00:00.000Z",
			"description": "GROCERY STORE",
			"value": -85.5,
			"externalId": "txn-abc123",
			"labels": ["Groceries"]
		}
	]
}
```

### Fields reference

**Account fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | |
| `institution` | string | no | Used in dedup key |
| `balanceGroup` | `CASH\|DEBT\|INVESTMENT\|OTHER` | yes | |
| `balanceType` | string | yes | e.g. "Checking", "Credit Card", "ETF" |
| `autoCalculated` | boolean | no | |
| `closed` | boolean | no | |
| `excluded` | boolean | no | |
| `balance.value` | number | no | |
| `balance.asOf` | string | no | ISO or PB date format |

**Asset fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | |
| `symbol` | string | no | Used in dedup key |
| `balanceGroup` | `CASH\|DEBT\|INVESTMENT\|OTHER` | yes | |
| `balanceType` | string | yes | |
| `type` | `WHOLE\|SHARES` | yes | |
| `sold` | boolean | no | |
| `excluded` | boolean | no | |
| `balance.*` | various | no | marketValue, bookValue, quantity, marketPrice, bookPrice, asOf |

**Transaction fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `accountName` | string | yes | Must match an account name in the payload or an existing account |
| `date` | string | yes | ISO or PB date format |
| `description` | string | no | Normalized (trimmed, collapsed whitespace, lowercased) for dedup |
| `value` | number | no | |
| `externalId` | string | no | Primary dedup key when present |
| `labels` | string[] | no | Created if they don't exist |
| `excluded` | boolean | no | |

### Response

```json
{
	"sessionId": "abc123def456ghi",
	"accounts": { "created": 1, "existing": 0 },
	"assets": { "created": 1, "existing": 0 },
	"transactions": { "created": 5, "skipped": 2 },
	"accountBalances": { "created": 1, "skipped": 0 },
	"assetBalances": { "created": 1, "skipped": 0 }
}
```

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

Session fields: `id`, `label`, `owner`, `recordsCreated`, `recordsSkipped`, `status` (`pending`|`completed`|`rolled_back`), `created`, `updated`.

## Revert an Import

`POST /api/canutin/import/revert`

Atomically deletes all records created by an import session (transactions, balances, accounts, assets) and cleans up orphaned labels and balance types. The operation runs inside a database transaction -- either everything is reverted or nothing is.

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
- Running the same import payload twice is safe -- duplicates are skipped
- Reverted sessions are marked as `rolled_back` and cannot be reverted again
- The import session is visible in the Canutin UI at `/settings`
