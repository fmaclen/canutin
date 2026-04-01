/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id || asset.assetShares_via_asset.recipient ?= @request.auth.id",
    "viewRule": "owner = @request.auth.id || asset.assetShares_via_asset.recipient ?= @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // update collection data
  unmarshal({
    "listRule": "owner = @request.auth.id",
    "viewRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
