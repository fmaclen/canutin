/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2193784671")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id || transactions_via_labels.account.accountShares_via_account.recipient ?= @request.auth.id",
    "viewRule": "owner = @request.auth.id || transactions_via_labels.account.accountShares_via_account.recipient ?= @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2193784671")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id",
    "viewRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
