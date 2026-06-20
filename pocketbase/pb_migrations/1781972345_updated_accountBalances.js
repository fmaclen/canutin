/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1811848958")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && owner = @request.auth.id && account.owner = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" && owner = @request.auth.id && account.owner = @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1811848958")

  // update collection data
  unmarshal({
    "createRule": "owner = @request.auth.id",
    "updateRule": "owner = @request.auth.id"
  }, collection)

  return app.save(collection)
})
