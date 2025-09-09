/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // add field
  collection.fields.addAt(6, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1178802947",
    "hidden": false,
    "id": "relation1101521935",
    "maxSelect": 999,
    "minSelect": 0,
    "name": "balances",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // remove field
  collection.fields.removeById("relation1101521935")

  return app.save(collection)
})
