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
        "id": "_clone_tZ11",
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
        "id": "_clone_cqj7",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "account",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
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
      },
      {
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
      }
    ],
    "id": "pbc_2731989374",
    "indexes": [],
    "listRule": "@request.auth.id != '' && (owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id)",
    "name": "latestAccountBalances",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "SELECT b.id, b.owner, b.account, b.value, b.asOf\nFROM accountBalances b\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM accountBalances n\n  WHERE n.account = b.account\n    AND (n.asOf, n.created, n.id) > (b.asOf, b.created, b.id)\n)",
    "viewRule": "@request.auth.id != '' && (owner = @request.auth.id || account.accountShares_via_account.recipient ?= @request.auth.id)"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2731989374");

  return app.delete(collection);
})
