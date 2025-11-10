/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select3808488157",
    "maxSelect": 1,
    "name": "balanceGroup",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "CASH",
      "DEBT",
      "INVESTMENT",
      "OTHER"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1321337024")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select3808488157",
    "maxSelect": 1,
    "name": "balanceGroup",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "CASH",
      "DEBT",
      "INVESTMENT",
      "OTHER"
    ]
  }))

  return app.save(collection)
})
