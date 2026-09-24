/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 0,
        "min": 0,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
        "help": "",
        "hidden": false,
        "id": "_clone_j8FF",
        "maxSize": 0,
        "name": "quantity",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "help": "",
        "hidden": false,
        "id": "_clone_gDnc",
        "maxSize": 0,
        "name": "price",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "help": "",
        "hidden": false,
        "id": "json494360628",
        "maxSize": 1,
        "name": "value",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "help": "",
        "hidden": false,
        "id": "json1295131543",
        "maxSize": 1,
        "name": "costBasis",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      }
    ],
    "id": "pbc_1382840795",
    "indexes": [],
    "listRule": "@request.auth.id != '' && (owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id)",
    "name": "latestSecurityBalances",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "SELECT\n  b.id,\n  b.owner,\n  b.account,\n  b.security,\n  b.asOf,\n  b.quantity,\n  b.price,\n  (CASE\n    WHEN b.quantity = 0 THEN 0\n    WHEN json_type(b.value) IN ('integer', 'real') THEN b.value\n    ELSE (\n      SELECT (CASE WHEN p.quantity = 0 THEN NULL ELSE p.value END)\n      FROM securityBalances p\n      WHERE p.account = b.account\n        AND p.security = b.security\n        AND (p.asOf, p.created, p.id) < (b.asOf, b.created, b.id)\n        AND (json_type(p.value) IN ('integer', 'real') OR p.quantity = 0)\n      ORDER BY p.asOf DESC, p.created DESC, p.id DESC\n      LIMIT 1\n    )\n  END) AS value,\n  (CASE\n    WHEN b.quantity = 0 THEN 0\n    WHEN json_type(b.costBasis) IN ('integer', 'real') THEN b.costBasis\n    WHEN json_type(b.quantity) IN ('integer', 'real') THEN (\n      SELECT (CASE WHEN p.quantity = b.quantity THEN p.costBasis END)\n      FROM securityBalances p\n      WHERE p.account = b.account\n        AND p.security = b.security\n        AND (p.asOf, p.created, p.id) < (b.asOf, b.created, b.id)\n        AND (json_type(p.costBasis) IN ('integer', 'real') OR p.quantity IS NOT b.quantity)\n      ORDER BY p.asOf DESC, p.created DESC, p.id DESC\n      LIMIT 1\n    )\n  END) AS costBasis\nFROM securityBalances b\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM securityBalances n\n  WHERE n.account = b.account\n    AND n.security = b.security\n    AND (n.asOf, n.created, n.id) > (b.asOf, b.created, b.id)\n)",
    "viewRule": "@request.auth.id != '' && (owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id)"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1382840795");

  return app.delete(collection);
})
