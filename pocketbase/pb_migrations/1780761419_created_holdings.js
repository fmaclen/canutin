/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "owner = @request.auth.id && security.owner = @request.auth.id && (account = '' || (account.owner = @request.auth.id && account.balanceGroup = 'INVESTMENT'))",
    "deleteRule": "owner = @request.auth.id",
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
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation3479234172",
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
        "collectionId": "pbc_1452358580",
        "hidden": false,
        "id": "relation3315324353",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "security",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_2324088501",
        "hidden": false,
        "id": "relation2100713124",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "account",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "number2683508278",
        "max": null,
        "min": null,
        "name": "quantity",
        "onlyInt": false,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "number421561462",
        "max": null,
        "min": null,
        "name": "marketPrice",
        "onlyInt": false,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_2949619099",
    "indexes": [],
    "listRule": "owner = @request.auth.id",
    "name": "holdings",
    "system": false,
    "type": "base",
    "updateRule": "owner = @request.auth.id && security.owner = @request.auth.id && (account = '' || (account.owner = @request.auth.id && account.balanceGroup = 'INVESTMENT')) && @request.body.owner:isset = false && @request.body.security:isset = false && @request.body.account:isset = false",
    "viewRule": "owner = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2949619099");

  return app.delete(collection);
})
