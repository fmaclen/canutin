/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && owner = @request.auth.id && asset.owner = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" && owner = @request.auth.id && asset.owner = @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // update collection data
  unmarshal({
    "createRule": "owner = @request.auth.id",
    "updateRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
