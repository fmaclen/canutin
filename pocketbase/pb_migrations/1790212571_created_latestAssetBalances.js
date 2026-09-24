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
        "id": "_clone_Ohip",
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
      },
      {
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
      },
      {
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
      },
      {
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
      }
    ],
    "id": "pbc_2514931440",
    "indexes": [],
    "listRule": "@request.auth.id != '' && (owner = @request.auth.id || asset.assetShares_via_asset.recipient ?= @request.auth.id)",
    "name": "latestAssetBalances",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "SELECT b.id, b.owner, b.asset, b.bookValue, b.marketValue, b.asOf\nFROM assetBalances b\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM assetBalances n\n  WHERE n.asset = b.asset\n    AND (n.asOf, n.created, n.id) > (b.asOf, b.created, b.id)\n)",
    "viewRule": "@request.auth.id != '' && (owner = @request.auth.id || asset.assetShares_via_asset.recipient ?= @request.auth.id)"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2514931440");

  return app.delete(collection);
})
