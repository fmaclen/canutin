/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3847291056")

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "number4083594199",
    "max": null,
    "min": null,
    "name": "recordsFailed",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "select3847291003",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "pending",
      "completed",
      "rolled_back",
      "completed_with_errors",
      "failed"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3847291056")

  // remove field
  collection.fields.removeById("number4083594199")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "select3847291003",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "pending",
      "completed",
      "rolled_back"
    ]
  }))

  return app.save(collection)
})
