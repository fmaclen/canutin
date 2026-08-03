/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3847291056")

  // add field
  collection.fields.addAt(9, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3413410174",
    "help": "",
    "hidden": false,
    "id": "relation704082790",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "connection",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3847291056")

  // remove field
  collection.fields.removeById("relation704082790")

  return app.save(collection)
})
