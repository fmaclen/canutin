/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // add field
  collection.fields.addAt(7, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2154324782",
    "hidden": false,
    "id": "relation4070553268",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "balanceType",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // remove field
  collection.fields.removeById("relation4070553268")

  return app.save(collection)
})
