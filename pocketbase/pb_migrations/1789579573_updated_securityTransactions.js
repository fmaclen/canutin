/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2175204147")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != '' && (owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id)",
    "viewRule": "@request.auth.id != '' && (owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id)"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2175204147")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id",
    "viewRule": "owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id"
  }, collection)

  return app.save(collection)
})
