/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // add field
  collection.fields.addAt(7, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1767278655",
    "max": 0,
    "min": 0,
    "name": "currency",
    "pattern": "^[A-Z0-9]{2,10}$",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // remove field
  collection.fields.removeById("text1767278655")

  return app.save(collection)
})
