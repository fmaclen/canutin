/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2154324782")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id || accounts_via_balanceType.accountShares_via_account.recipient ?= @request.auth.id || assets_via_balanceType.assetShares_via_asset.recipient ?= @request.auth.id",
    "viewRule": "owner = @request.auth.id || accounts_via_balanceType.accountShares_via_account.recipient ?= @request.auth.id || assets_via_balanceType.assetShares_via_asset.recipient ?= @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2154324782")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id",
    "viewRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
