/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // add field
  collection.fields.addAt(5, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1321337024",
    "hidden": false,
    "id": "relation45046364",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "asset",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // remove field
  collection.fields.removeById("relation45046364")

  return app.save(collection)
})
