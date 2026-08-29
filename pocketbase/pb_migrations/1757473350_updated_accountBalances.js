/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1811848958")

  // add field
  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2324088501",
    "hidden": false,
    "id": "relation2100713124",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "account",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1811848958")

  // remove field
  collection.fields.removeById("relation2100713124")

  return app.save(collection)
})
