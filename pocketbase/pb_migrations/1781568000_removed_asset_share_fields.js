/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const assets = app.findCollectionByNameOrId("pbc_1321337024")
  assets.fields.removeById("text3972544249")
  assets.fields.removeById("select2363381545")

  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947")
  assetBalances.fields.removeById("number2683508278")
  assetBalances.fields.removeById("number1337013966")
  assetBalances.fields.removeById("number421561462")

  app.save(assets)
  return app.save(assetBalances)
}, (app) => {
  const assets = app.findCollectionByNameOrId("pbc_1321337024")
  assets.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3972544249",
    "max": 0,
    "min": 0,
    "name": "symbol",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  assets.fields.addAt(8, new Field({
    "hidden": false,
    "id": "select2363381545",
    "maxSelect": 1,
    "name": "type",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "WHOLE",
      "SHARES"
    ]
  }))

  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947")
  assetBalances.fields.addAt(2, new Field({
    "hidden": false,
    "id": "number2683508278",
    "max": null,
    "min": null,
    "name": "quantity",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))
  assetBalances.fields.addAt(7, new Field({
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
  assetBalances.fields.addAt(8, new Field({
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

  app.save(assets)
  return app.save(assetBalances)
})
