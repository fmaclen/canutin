/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "grantedBy = @request.auth.id && account.owner = @request.auth.id && recipient != @request.auth.id",
    "deleteRule": "grantedBy = @request.auth.id",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
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
        "collectionId": "pbc_2324088501",
        "hidden": false,
        "id": "relation2100713124",
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
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation1745156937",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "recipient",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2298130845",
        "max": 0,
        "min": 0,
        "name": "recipientEmail",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation2342748552",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "grantedBy",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "select3664798075",
        "maxSelect": 1,
        "name": "accessRole",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "VIEWER"
        ]
      },
      {
        "hidden": false,
        "id": "select3552878231",
        "maxSelect": 1,
        "name": "perspective",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "NORMAL",
          "INVERSE"
        ]
      },
      {
        "hidden": false,
        "id": "bool2936364408",
        "name": "includeInNetWorth",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_3262151894",
    "indexes": [
      "CREATE UNIQUE INDEX idx_accountShares_account_recipient ON accountShares (account, recipient)"
    ],
    "listRule": "grantedBy = @request.auth.id || recipient = @request.auth.id",
    "name": "accountShares",
    "system": false,
    "type": "base",
    "updateRule": "grantedBy = @request.auth.id || recipient = @request.auth.id",
    "viewRule": "grantedBy = @request.auth.id || recipient = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3262151894");

  return app.delete(collection);
})
