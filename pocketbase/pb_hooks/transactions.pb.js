/** @typedef {import('../pb_data/types').RecordEvent} RecordEvent */

/**
 * @param {RecordEvent} e
 */
function onTxCreate(e) {
  const accountId = e.record.getString('account')
  if (!accountId) return
  const account = $app.findRecordById('accounts', accountId)
  const autoCalculated = account.getDateTime('autoCalculated')
  if (!autoCalculated || autoCalculated.isZero()) return
  const txs = $app.findRecordsByFilter('transactions', 'account={:aid}', '', 0, 0, { aid: accountId })
  let sum = 0
  for (const tx of txs) {
    if (!tx) continue
    const excluded = tx.getDateTime('excluded')
    if (excluded && !excluded.isZero()) continue
    const v = tx.getFloat('value')
    sum += v || 0
  }
  const coll = $app.findCollectionByNameOrId('accountBalances')
  const rec = new Record(coll)
  rec.set('account', accountId)
  rec.set('value', sum)
  rec.set('asOf', e.record.getDateTime('date'))
  const ownerId = account.getString('owner')
  if (ownerId) rec.set('owner', ownerId)
  $app.save(rec)
}

/**
 * @param {RecordEvent} e
 */
function onTxUpdate(e) {
  const oldAcc = e.record.original().getString('account')
  const newAcc = e.record.getString('account')
  if (oldAcc && oldAcc !== newAcc) {
    const account = $app.findRecordById('accounts', oldAcc)
    const autoCalculated = account.getDateTime('autoCalculated')
    if (autoCalculated && !autoCalculated.isZero()) {
      const txs = $app.findRecordsByFilter('transactions', 'account={:aid}', '', 0, 0, { aid: oldAcc })
      let sum = 0
      for (const tx of txs) {
        if (!tx) continue
        const excluded = tx.getDateTime('excluded')
        if (excluded && !excluded.isZero()) continue
        const v = tx.getFloat('value')
        sum += v || 0
      }
      const coll = $app.findCollectionByNameOrId('accountBalances')
      const rec = new Record(coll)
      rec.set('account', oldAcc)
      rec.set('value', sum)
      rec.set('asOf', e.record.getDateTime('date'))
      const ownerId = account.getString('owner')
      if (ownerId) rec.set('owner', ownerId)
      $app.save(rec)
    }
  }
  if (newAcc) {
    const account = $app.findRecordById('accounts', newAcc)
    const autoCalculated = account.getDateTime('autoCalculated')
    if (autoCalculated && !autoCalculated.isZero()) {
      const txs = $app.findRecordsByFilter('transactions', 'account={:aid}', '', 0, 0, { aid: newAcc })
      let sum = 0
      for (const tx of txs) {
        if (!tx) continue
        const excluded = tx.getDateTime('excluded')
        if (excluded && !excluded.isZero()) continue
        const v = tx.getFloat('value')
        sum += v || 0
      }
      const coll = $app.findCollectionByNameOrId('accountBalances')
      const rec = new Record(coll)
      rec.set('account', newAcc)
      rec.set('value', sum)
      rec.set('asOf', e.record.getDateTime('date'))
      const ownerId = account.getString('owner')
      if (ownerId) rec.set('owner', ownerId)
      $app.save(rec)
    }
  }
}

/**
 * @param {RecordEvent} e
 */
function onTxDelete(e) {
  const accountId = e.record.getString('account')
  if (!accountId) return
  const account = $app.findRecordById('accounts', accountId)
  const autoCalculated = account.getDateTime('autoCalculated')
  if (!autoCalculated || autoCalculated.isZero()) return
  const txs = $app.findRecordsByFilter('transactions', 'account={:aid}', '', 0, 0, { aid: accountId })
  let sum = 0
  for (const tx of txs) {
    if (!tx) continue
    const excluded = tx.getDateTime('excluded')
    if (excluded && !excluded.isZero()) continue
    const v = tx.getFloat('value')
    sum += v || 0
  }
  const coll = $app.findCollectionByNameOrId('accountBalances')
  const rec = new Record(coll)
  rec.set('account', accountId)
  rec.set('value', sum)
  const ownerId = account.getString('owner')
  if (ownerId) rec.set('owner', ownerId)
  $app.save(rec)
}

onRecordAfterCreateSuccess(onTxCreate, 'transactions')
onRecordAfterUpdateSuccess(onTxUpdate, 'transactions')
onRecordAfterDeleteSuccess(onTxDelete, 'transactions')
