/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "owner = @request.auth.id",
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
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1579384326",
        "max": 0,
        "min": 0,
        "name": "name",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
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
      },
      {
        "autogeneratePattern": "",
        "hidden": true,
        "id": "text73334810",
        "max": 0,
        "min": 0,
        "name": "normalizedName",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": true,
        "id": "text3171053027",
        "max": 0,
        "min": 0,
        "name": "normalizedSymbol",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
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
        "cascadeDelete": false,
        "collectionId": "pbc_3847291056",
        "hidden": false,
        "id": "relation2600186323",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "importSession",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
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
    "id": "pbc_1452358580",
    "indexes": [
      "CREATE UNIQUE INDEX idx_securities_owner_normalizedName ON securities (owner, normalizedName)",
      "CREATE UNIQUE INDEX idx_securities_owner_normalizedSymbol ON securities (owner, normalizedSymbol) WHERE normalizedSymbol != ''",
      "CREATE INDEX idx_securities_importSession ON securities (importSession, owner)"
    ],
    "listRule": "owner = @request.auth.id",
    "name": "securities",
    "system": false,
    "type": "base",
    "updateRule": "owner = @request.auth.id",
    "viewRule": "owner = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1452358580");

  return app.delete(collection);
})
