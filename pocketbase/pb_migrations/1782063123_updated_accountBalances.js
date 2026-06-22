/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1811848958")

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "select1602912115",
    "maxSelect": 1,
    "name": "source",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "derived",
      "manual",
      "import"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1811848958")

  // remove field
  collection.fields.removeById("select1602912115")

  return app.save(collection)
})
