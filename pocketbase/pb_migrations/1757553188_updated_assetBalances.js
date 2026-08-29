/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "date660147924",
    "max": "",
    "min": "",
    "name": "asOf",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // remove field
  collection.fields.removeById("date660147924")

  return app.save(collection)
})
