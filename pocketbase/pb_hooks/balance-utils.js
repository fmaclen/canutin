/** @typedef {import('../pb_data/types').Record} Record */

const DEBOUNCE_MS = 1000

/**
 * Attempts to calculate and save the balance for an auto-calculated account.
 * Uses atomic SQL UPDATE with a nonce to prevent race conditions when multiple
 * transactions are created concurrently.
 *
 * @param {string} accountId
 */
function tryCalculateBalance(accountId) {
  const account = $app.findRecordById('accounts', accountId)
  const autoCalculated = account.getDateTime('autoCalculated')
  if (!autoCalculated || autoCalculated.isZero()) return

  const nonce = $security.randomString(16)
  const now = new Date()
  const threshold = new Date(now.getTime() - DEBOUNCE_MS)

  // Atomic conditional UPDATE - only succeeds if no recent calculation
  $app
    .db()
    .newQuery(
      `
      UPDATE accounts
      SET balanceLockNonce = {:nonce}, balanceCalculatedAt = {:now}
      WHERE id = {:id}
        AND (balanceCalculatedAt IS NULL OR balanceCalculatedAt = '' OR balanceCalculatedAt <= {:threshold})
    `
    )
    .bind({
      id: accountId,
      nonce: nonce,
      now: now.toISOString(),
      threshold: threshold.toISOString()
    })
    .execute()

  // Check if we won the lock
  const updated = $app.findRecordById('accounts', accountId)
  if (updated.getString('balanceLockNonce') !== nonce) return

  // Calculate and save balance
  const txs = $app.findRecordsByFilter('transactions', 'account={:aid}', '', 0, 0, {
    aid: accountId
  })
  let sum = 0
  for (const tx of txs) {
    if (!tx) continue
    const excluded = tx.getDateTime('excluded')
    if (excluded && !excluded.isZero()) continue
    sum += tx.getFloat('value') || 0
  }

  const coll = $app.findCollectionByNameOrId('accountBalances')
  const rec = new Record(coll)
  rec.set('account', accountId)
  rec.set('value', sum)
  rec.set('asOf', now)
  const ownerId = account.getString('owner')
  if (ownerId) rec.set('owner', ownerId)
  $app.save(rec)
}

module.exports = { tryCalculateBalance, DEBOUNCE_MS }
