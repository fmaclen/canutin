# Demo Mode

## Overview

The `/demo` route allows users to try the app without signing up. It creates a guest account, seeds realistic financial data, and redirects to the home page.

## Flow

1. User clicks "Try as guest" on `/auth`
2. Navigates to `/demo` route
3. `DemoContext.startDemo()` executes:
   - Creates user with random email
   - Authenticates via `AuthContext.login()`
   - Seeds demo data (balance types, labels, accounts, assets, transactions)
   - Stores flag in localStorage to prevent re-seeding
4. Redirects to `/` on success

## Key Files

| File                                   | Purpose                              |
| -------------------------------------- | ------------------------------------ |
| `src/lib/demo/demo.svelte.ts`          | Demo context with `startDemo()`      |
| `src/lib/demo/seed.ts`                 | Seeding logic and data orchestration |
| `src/lib/demo/seed-data/*.ts`          | Static seed data definitions         |
| `src/routes/(guest)/demo/+page.svelte` | Demo route page                      |

## Requirements

### Determinism

The demo must produce **deterministic, predictable results**:

- Net worth must be exactly **$184,719.09** every time
- All balances must be fully calculated before displaying
- Users should trust the accuracy of what they see

Expected values (from seed data):

| Source                  | Value           |
| ----------------------- | --------------- |
| Checking (auto-calc)    | $3,400.00       |
| Savings (auto-calc)     | $6,000.00       |
| Credit Card (auto-calc) | $437.73         |
| Auto Loan               | -$21,250.00     |
| Roth IRA                | $18,535.78      |
| 401k                    | $4,250.58       |
| Wallet                  | $1,300.00       |
| SPY                     | $29,000.00      |
| GameStop                | $3,125.00       |
| Bitcoin                 | $69,420.00      |
| Ethereum                | $17,500.00      |
| Collectibles            | $14,500.00      |
| Vehicle                 | $38,500.00      |
| **Net Worth**           | **$184,719.09** |

### No Flickering

UI must not flicker during seeding:

- Cashflow chart should not disappear/reappear
- Balance values should not jump around
- Use debouncing for realtime event handlers (see `conventions/realtime.md`)

### Performance

Seeding should complete quickly:

- Batch database operations (10 records per batch)
- Use `requestKey: null` on PocketBase queries during bulk operations
- Go hooks debounce balance calculations (250ms)

## Balance Calculation

Account balances are calculated by Go hooks in PocketBase (`pocketbase/main.go`):

1. Transaction create/update/delete triggers `enqueueBalance(accountID)`
2. Worker debounces (250ms) then calculates sum of non-excluded transactions
3. New `accountBalances` record is created

**Critical**: The test/UI must wait for balance calculations to complete before asserting values.

## Anti-patterns

- **Non-deterministic assertions** - Never use `not.toContainText('$0')` as the only check
- **Timeouts/sleeps** - Never add artificial delays; wait for actual conditions
- **Ignoring balance timing** - Always account for async Go hook execution

## See Also

- [conventions/realtime.md](./conventions/realtime.md) - Debouncing patterns
- `pocketbase/main.go` - Go balance hooks implementation
