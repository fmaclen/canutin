/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1382840795")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  b.id,\n  b.owner,\n  b.account,\n  b.security,\n  b.asOf,\n  b.quantity,\n  b.price,\n  (CASE\n    WHEN b.quantity = 0 THEN 0\n    WHEN json_type(b.value) IN ('integer', 'real') THEN b.value\n    ELSE (\n      SELECT (CASE WHEN p.quantity = 0 THEN NULL ELSE p.value END)\n      FROM securityBalances p\n      WHERE p.account = b.account\n        AND p.security = b.security\n        AND (p.asOf, p.created, p.id) < (b.asOf, b.created, b.id)\n        AND (json_type(p.value) IN ('integer', 'real') OR p.quantity = 0)\n      ORDER BY p.asOf DESC, p.created DESC, p.id DESC\n      LIMIT 1\n    )\n  END) AS value,\n  (CASE\n    WHEN b.quantity = 0 THEN 0\n    WHEN json_type(b.costBasis) IN ('integer', 'real') THEN b.costBasis\n    WHEN json_type(b.quantity) IN ('integer', 'real') THEN (\n      SELECT (CASE WHEN p.quantity = b.quantity THEN p.costBasis END)\n      FROM securityBalances p\n      WHERE p.account = b.account\n        AND p.security = b.security\n        AND (p.asOf, p.created, p.id) < (b.asOf, b.created, b.id)\n        AND (json_type(p.costBasis) IN ('integer', 'real') OR p.quantity IS NOT b.quantity)\n      ORDER BY p.asOf DESC, p.created DESC, p.id DESC\n      LIMIT 1\n    )\n  END) AS costBasis\nFROM (SELECT DISTINCT account, security FROM securityBalances) pr\nJOIN securityBalances b ON b.id = (\n  SELECT x.id\n  FROM securityBalances x\n  WHERE x.account = pr.account\n    AND x.security = pr.security\n  ORDER BY x.asOf DESC, x.created DESC, x.id DESC\n  LIMIT 1\n)"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_q5Mm")

  // remove field
  collection.fields.removeById("_clone_t9xE")

  // remove field
  collection.fields.removeById("_clone_W8p6")

  // remove field
  collection.fields.removeById("_clone_RGvG")

  // remove field
  collection.fields.removeById("_clone_j8FF")

  // remove field
  collection.fields.removeById("_clone_gDnc")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "_clone_MjKx",
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
    "id": "_clone_TP0V",
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
    "cascadeDelete": true,
    "collectionId": "pbc_1452358580",
    "help": "",
    "hidden": false,
    "id": "_clone_P0Zd",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "security",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_yIZP",
    "max": "",
    "min": "",
    "name": "asOf",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_9Iov",
    "maxSize": 0,
    "name": "quantity",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_U9Ot",
    "maxSize": 0,
    "name": "price",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1382840795")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  b.id,\n  b.owner,\n  b.account,\n  b.security,\n  b.asOf,\n  b.quantity,\n  b.price,\n  (CASE\n    WHEN b.quantity = 0 THEN 0\n    WHEN json_type(b.value) IN ('integer', 'real') THEN b.value\n    ELSE (\n      SELECT (CASE WHEN p.quantity = 0 THEN NULL ELSE p.value END)\n      FROM securityBalances p\n      WHERE p.account = b.account\n        AND p.security = b.security\n        AND (p.asOf, p.created, p.id) < (b.asOf, b.created, b.id)\n        AND (json_type(p.value) IN ('integer', 'real') OR p.quantity = 0)\n      ORDER BY p.asOf DESC, p.created DESC, p.id DESC\n      LIMIT 1\n    )\n  END) AS value,\n  (CASE\n    WHEN b.quantity = 0 THEN 0\n    WHEN json_type(b.costBasis) IN ('integer', 'real') THEN b.costBasis\n    WHEN json_type(b.quantity) IN ('integer', 'real') THEN (\n      SELECT (CASE WHEN p.quantity = b.quantity THEN p.costBasis END)\n      FROM securityBalances p\n      WHERE p.account = b.account\n        AND p.security = b.security\n        AND (p.asOf, p.created, p.id) < (b.asOf, b.created, b.id)\n        AND (json_type(p.costBasis) IN ('integer', 'real') OR p.quantity IS NOT b.quantity)\n      ORDER BY p.asOf DESC, p.created DESC, p.id DESC\n      LIMIT 1\n    )\n  END) AS costBasis\nFROM securityBalances b\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM securityBalances n\n  WHERE n.account = b.account\n    AND n.security = b.security\n    AND (n.asOf, n.created, n.id) > (b.asOf, b.created, b.id)\n)"
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "_clone_q5Mm",
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
    "id": "_clone_t9xE",
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
    "cascadeDelete": true,
    "collectionId": "pbc_1452358580",
    "help": "",
    "hidden": false,
    "id": "_clone_W8p6",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "security",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_RGvG",
    "max": "",
    "min": "",
    "name": "asOf",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_j8FF",
    "maxSize": 0,
    "name": "quantity",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_gDnc",
    "maxSize": 0,
    "name": "price",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // remove field
  collection.fields.removeById("_clone_MjKx")

  // remove field
  collection.fields.removeById("_clone_TP0V")

  // remove field
  collection.fields.removeById("_clone_P0Zd")

  // remove field
  collection.fields.removeById("_clone_yIZP")

  // remove field
  collection.fields.removeById("_clone_9Iov")

  // remove field
  collection.fields.removeById("_clone_U9Ot")

  return app.save(collection)
})
