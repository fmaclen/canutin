/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2731989374")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT b.id, b.owner, b.account, b.value, b.asOf\nFROM (SELECT DISTINCT account FROM accountBalances) pr\nJOIN accountBalances b ON b.id = (\n  SELECT x.id\n  FROM accountBalances x\n  WHERE x.account = pr.account\n  ORDER BY x.asOf DESC, x.created DESC, x.id DESC\n  LIMIT 1\n)\n"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_tZ11")

  // remove field
  collection.fields.removeById("_clone_cqj7")

  // remove field
  collection.fields.removeById("_clone_fG2b")

  // remove field
  collection.fields.removeById("_clone_7yAL")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "_clone_hscD",
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
    "collectionId": "pbc_2324088501",
    "help": "",
    "hidden": false,
    "id": "_clone_HcX6",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "account",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_4Dau",
    "max": null,
    "min": null,
    "name": "value",
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
    "id": "_clone_QXVv",
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
  const collection = app.findCollectionByNameOrId("pbc_2731989374")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT b.id, b.owner, b.account, b.value, b.asOf\nFROM accountBalances b\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM accountBalances n\n  WHERE n.account = b.account\n    AND (n.asOf, n.created, n.id) > (b.asOf, b.created, b.id)\n)"
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "_clone_tZ11",
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
    "collectionId": "pbc_2324088501",
    "help": "",
    "hidden": false,
    "id": "_clone_cqj7",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "account",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_fG2b",
    "max": null,
    "min": null,
    "name": "value",
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
    "id": "_clone_7yAL",
    "max": "",
    "min": "",
    "name": "asOf",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "date"
  }))

  // remove field
  collection.fields.removeById("_clone_hscD")

  // remove field
  collection.fields.removeById("_clone_HcX6")

  // remove field
  collection.fields.removeById("_clone_4Dau")

  // remove field
  collection.fields.removeById("_clone_QXVv")

  return app.save(collection)
})
