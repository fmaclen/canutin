/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3174063690")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id",
    "viewRule": "owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3174063690")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id",
    "viewRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
