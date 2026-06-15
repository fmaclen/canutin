/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const transactions = app.findCollectionByNameOrId("pbc_3174063690")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_transactions_importSession ON transactions (importSession, owner)",
      "CREATE INDEX idx_transactions_externalId ON transactions (account, externalId, owner) WHERE externalId != ''",
      "CREATE INDEX idx_transactions_account_date ON transactions (account, date)"
    ]
  }, transactions)

  app.save(transactions)

  const accountBalances = app.findCollectionByNameOrId("pbc_1811848958")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_accountBalances_importSession ON accountBalances (importSession, owner)",
      "CREATE INDEX idx_accountBalances_account_asOf ON accountBalances (account, asOf)"
    ]
  }, accountBalances)

  app.save(accountBalances)

  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_assetBalances_importSession ON assetBalances (importSession, owner)",
      "CREATE INDEX idx_assetBalances_asset_asOf ON assetBalances (asset, asOf)"
    ]
  }, assetBalances)

  app.save(assetBalances)

  const securityBalances = app.findCollectionByNameOrId("pbc_3206402748")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_securityBalances_importSession ON securityBalances (importSession, owner)",
      "CREATE INDEX idx_securityBalances_lookup ON securityBalances (account, security, asOf)",
      "CREATE INDEX idx_securityBalances_account_asOf ON securityBalances (account, asOf)"
    ]
  }, securityBalances)

  app.save(securityBalances)

  const securityTransactions = app.findCollectionByNameOrId("pbc_2175204147")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_securityTransactions_importSession ON securityTransactions (importSession, owner)",
      "CREATE INDEX idx_securityTransactions_lookup ON securityTransactions (account, security, date)",
      "CREATE INDEX idx_securityTransactions_account_date ON securityTransactions (account, date)"
    ]
  }, securityTransactions)

  return app.save(securityTransactions)
}, (app) => {
  const transactions = app.findCollectionByNameOrId("pbc_3174063690")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_transactions_importSession ON transactions (importSession, owner)",
      "CREATE INDEX idx_transactions_externalId ON transactions (account, externalId, owner) WHERE externalId != ''"
    ]
  }, transactions)

  app.save(transactions)

  const accountBalances = app.findCollectionByNameOrId("pbc_1811848958")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_accountBalances_importSession ON accountBalances (importSession, owner)"
    ]
  }, accountBalances)

  app.save(accountBalances)

  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_assetBalances_importSession ON assetBalances (importSession, owner)"
    ]
  }, assetBalances)

  app.save(assetBalances)

  const securityBalances = app.findCollectionByNameOrId("pbc_3206402748")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_securityBalances_importSession ON securityBalances (importSession, owner)",
      "CREATE INDEX idx_securityBalances_lookup ON securityBalances (account, security, asOf)"
    ]
  }, securityBalances)

  app.save(securityBalances)

  const securityTransactions = app.findCollectionByNameOrId("pbc_2175204147")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_securityTransactions_importSession ON securityTransactions (importSession, owner)",
      "CREATE INDEX idx_securityTransactions_lookup ON securityTransactions (account, security, date)"
    ]
  }, securityTransactions)

  return app.save(securityTransactions)
})
