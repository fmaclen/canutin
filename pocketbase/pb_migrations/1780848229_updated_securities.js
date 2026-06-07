/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1452358580")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id || securityBalances_via_security.account.accountShares_via_account.recipient ?= @request.auth.id || securityTransactions_via_security.account.accountShares_via_account.recipient ?= @request.auth.id",
    "viewRule": "owner = @request.auth.id || securityBalances_via_security.account.accountShares_via_account.recipient ?= @request.auth.id || securityTransactions_via_security.account.accountShares_via_account.recipient ?= @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1452358580")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id",
    "viewRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
