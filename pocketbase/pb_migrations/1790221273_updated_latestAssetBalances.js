/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2514931440")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT b.id, b.owner, b.asset, b.bookValue, b.marketValue, b.asOf\nFROM (SELECT DISTINCT asset FROM assetBalances) pr\nJOIN assetBalances b ON b.id = (\n  SELECT x.id\n  FROM assetBalances x\n  WHERE x.asset = pr.asset\n  ORDER BY x.asOf DESC, x.created DESC, x.id DESC\n  LIMIT 1\n)\n"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_Ohip")

  // remove field
  collection.fields.removeById("_clone_Qmrq")

  // remove field
  collection.fields.removeById("_clone_R1AL")

  // remove field
  collection.fields.removeById("_clone_jC0v")

  // remove field
  collection.fields.removeById("_clone_tRG4")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "_clone_ihKJ",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "owner",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_1321337024",
    "help": "",
    "hidden": false,
    "id": "_clone_I4ST",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "asset",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_pEJn",
    "max": null,
    "min": null,
    "name": "bookValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_fxU8",
    "max": null,
    "min": null,
    "name": "marketValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_APJ9",
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
  const collection = app.findCollectionByNameOrId("pbc_2514931440")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT b.id, b.owner, b.asset, b.bookValue, b.marketValue, b.asOf\nFROM assetBalances b\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM assetBalances n\n  WHERE n.asset = b.asset\n    AND (n.asOf, n.created, n.id) > (b.asOf, b.created, b.id)\n)"
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "_clone_Ohip",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "owner",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_1321337024",
    "help": "",
    "hidden": false,
    "id": "_clone_Qmrq",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "asset",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_R1AL",
    "max": null,
    "min": null,
    "name": "bookValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_jC0v",
    "max": null,
    "min": null,
    "name": "marketValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_tRG4",
    "max": "",
    "min": "",
    "name": "asOf",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "date"
  }))

  // remove field
  collection.fields.removeById("_clone_ihKJ")

  // remove field
  collection.fields.removeById("_clone_I4ST")

  // remove field
  collection.fields.removeById("_clone_pEJn")

  // remove field
  collection.fields.removeById("_clone_fxU8")

  // remove field
  collection.fields.removeById("_clone_APJ9")

  return app.save(collection)
})
