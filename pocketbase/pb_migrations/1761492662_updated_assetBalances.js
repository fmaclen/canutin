/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "number1337013966",
    "max": null,
    "min": null,
    "name": "bookPrice",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "number421561462",
    "max": null,
    "min": null,
    "name": "marketPrice",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(1, new Field({
    "hidden": false,
    "id": "number494360628",
    "max": null,
    "min": null,
    "name": "marketValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "number405181692",
    "max": null,
    "min": null,
    "name": "bookValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1178802947")

  // remove field
  collection.fields.removeById("number1337013966")

  // remove field
  collection.fields.removeById("number421561462")

  // update field
  collection.fields.addAt(1, new Field({
    "hidden": false,
    "id": "number494360628",
    "max": null,
    "min": null,
    "name": "value",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "number405181692",
    "max": null,
    "min": null,
    "name": "cost",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
